import fs from "fs/promises";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { runAdapterTest } from "../../test";
import { getMigrations } from "../../../db/get-migration";
import path from "path";
import Database from "better-sqlite3";
import { kyselyAdapter } from "..";
import { Kysely, PostgresDialect, sql, SqliteDialect } from "kysely";
import { Pool } from "pg";

describe("adapter test", async () => {
	const database = new Database(path.join(__dirname, "test.db"));
	const pgDb = new Kysely({
		dialect: new PostgresDialect({
			pool: new Pool({
				connectionString: "postgres://user:password@localhost:5432/better_auth",
			}),
		}),
	});
	beforeEach(async () => {
		const { runMigrations } = await getMigrations({
			database,
		});
		await runMigrations();
		const { runMigrations: pgMigrations } = await getMigrations({
			database: {
				db: pgDb,
				type: "postgres",
			},
		});
		await pgMigrations();
	});

	afterAll(async () => {
		await fs.unlink(path.join(__dirname, "test.db"));
		await sql`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`.execute(pgDb);
		await pgDb.destroy();
	});
	const sqlite = new Database(path.join(__dirname, "test.db"));
	const db = new Kysely({
		dialect: new SqliteDialect({
			database: sqlite,
		}),
	});

	const adapter = kyselyAdapter(db, {
		transform: {
			schema: {},
			boolean: true,
			date: true,
		},
	});

	//sqlite
	await runAdapterTest({
		adapter,
	});

	const pgAdapter = kyselyAdapter(pgDb, {
		transform: {
			schema: {},
			boolean: true,
			date: true,
		},
	});

	//postgres
	await runAdapterTest({
		adapter: pgAdapter,
	});
});
