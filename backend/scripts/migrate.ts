import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { postgresString } from "@/db/db";

console.log("Migrating...");

const db = drizzle(postgresString);

await db.execute(sql`CREATE SCHEMA IF NOT EXISTS auth;`);

await migrate(db, { migrationsFolder: "drizzle" });

console.log("Migrations applied, seeding lookup tables...");

// Добавляем базовые типы и статусы заявок
const currentFilePath = fileURLToPath(import.meta.url);
const currentDir = dirname(currentFilePath);
const issueTypesPath = resolve(currentDir, "../base_issue_types.txt");

const rawIssueTypes = await readFile(issueTypesPath, "utf-8");
const issueTypes = rawIssueTypes
	.split(/\r?\n/)
	.map((line) => line.trim())
	.filter(Boolean)
	.map((line) => {
		if (line.startsWith('"') && line.endsWith('"')) {
			return line.slice(1, -1);
		}
		return line;
	});

for (const issueType of issueTypes) {
	await db.execute(
		sql`insert into issue_types (name) values (${issueType}) on conflict (name) do nothing`,
	);
}

await db.execute(
	sql`insert into issue_statuses (name) values ('В обработке') on conflict (name) do nothing`,
);
await db.execute(
	sql`insert into issue_statuses (name) values ('В работе') on conflict (name) do nothing`,
);
await db.execute(
	sql`insert into issue_statuses (name) values ('Выполнена') on conflict (name) do nothing`,
);
await db.execute(
	sql`insert into issue_statuses (name) values ('Отклонена') on conflict (name) do nothing`,
);
await db.execute(
	sql`insert into issue_statuses (name) values ('На валидации') on conflict (name) do nothing`,
);

console.log("Seeding completed");
process.exit(0);
