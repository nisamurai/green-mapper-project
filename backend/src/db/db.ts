import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from "./schema";
import { RedisDrizzleCache } from "./redis-cache";

export const postgresString = (
  "postgresql://" +
  `${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}` + 
  `@${process.env.IN_CONTAINER ? "postgres:5432" : "localhost:5252"}/` +
  `${process.env.POSTGRES_DB}`
) 

const pool = new Pool({
  connectionString: postgresString,
});
// console.log(`Connecting to PostgreSQL at ${postgresString}...`);
const redisString = `redis://default:${process.env.REDIS_PASSWORD}@${process.env.IN_CONTAINER ? "redis" : 'localhost'}:6379`;
const disableRedisCache = process.env.DISABLE_REDIS_CACHE === "true";
// console.log(`Connecting to Redis at ${redisString}...`);
export const db = drizzle(pool, {
  schema,
  logger: true, // Keep this on to see the cache in action
  ...(disableRedisCache ? {} : { cache: new RedisDrizzleCache(redisString) }),
});