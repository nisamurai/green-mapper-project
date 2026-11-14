import { Cache } from 'drizzle-orm/cache/core';
import { Table, getTableName, is } from 'drizzle-orm';
import Keyv from 'keyv';
import Redis from 'ioredis';

const dateReviver = (key: string, value: any) => {
  const isoDateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/;
  if (typeof value === 'string' && isoDateRegex.test(value)) {
    return new Date(value);
  }
  return value;
};

export class RedisDrizzleCache extends Cache {
  private kv: Keyv;
  private redis: Redis;
  private globalTtl = 180000; // 3 minutes

  constructor(redisUrl: string) {
    super();
    this.redis = new Redis(redisUrl);

    const customStore = {
      get: (key: string) => this.redis.get(key),
      set: (key: string, value: string, ttl?: number) => 
        ttl ? this.redis.set(key, value, 'PX', ttl) : this.redis.set(key, value),
      delete: (key: string) => this.redis.del(key).then(v => v > 0),
      clear: () => this.redis.flushdb().then(() => undefined),
    };

    this.kv = new Keyv({ 
      store: customStore,
      serialize: (val) => JSON.stringify(val),
      deserialize: (val) => JSON.parse(val, dateReviver)
    });
  }

  override strategy(): "explicit" | "all" {
    return "all"; 
  }

  override async get(key: string): Promise<any[] | undefined> {
    const result = await this.kv.get(key);
    
    if (result) {
      console.log(`\x1b[32m[Drizzle Cache] HIT\x1b[0m - Key: ${key.substring(0, 12)}...`);
      return result;
    }

    console.log(`\x1b[31m[Drizzle Cache] MISS\x1b[0m - Key: ${key.substring(0, 12)}...`);
    return undefined;
  }

  override async put(
    key: string,
    response: any,
    tables: string[],
  ): Promise<void> {
    await this.kv.set(key, response, this.globalTtl);
    
    console.log(`\x1b[34m[Drizzle Cache] STORE\x1b[0m - Key: ${key.substring(0, 12)}... (Tables: ${tables.join(', ')})`);

    for (const table of tables) {
      await this.redis.sadd(`drizzle:table:${table}`, key);
    }
  }

  override async onMutate(params: {
    tables: string | string[] | Table<any> | Table<any>[];
  }): Promise<void> {
    const tablesArray = Array.isArray(params.tables) ? params.tables : [params.tables];

    for (const table of tablesArray) {
      const tableName = is(table, Table) ? getTableName(table) : (table as string);
      const setKey = `drizzle:table:${tableName}`;
      const keysToDelete = await this.redis.smembers(setKey);

      if (keysToDelete.length > 0) {
        console.log(`\x1b[33m[Drizzle Cache] INVALIDATE\x1b[0m - Table: ${tableName} (${keysToDelete.length} keys)`);
        await Promise.all([
          ...keysToDelete.map(key => this.kv.delete(key)),
          this.redis.del(setKey)
        ]);
      }
    }
  }
}