import fs from "fs/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runAdapterTest } from "../../test";
import { getMigrations } from "../../../db/get-migration";
import path from "path";
import Database from "better-sqlite3";
import { kyselyAdapter } from "..";
import { Kysely, MysqlDialect, SqliteDialect } from "kysely";
import type { BetterAuthOptions } from "../../../types";
import { createPool } from "mysql2/promise";

describe("adapter test", async () => {
	const sqlite = new Database(path.join(__dirname, "test.db"));
	const mysql = createPool("mysql://user:password@localhost:3306/better_auth");
	const sqliteKy = new Kysely({
		dialect: new SqliteDialect({
			database: sqlite,
		}),
	});
	const mysqlKy = new Kysely({
		dialect: new MysqlDialect(mysql),
	});
	const opts = (database: BetterAuthOptions["database"]) =>
		({
			database: database,
			user: {
				fields: {
					email: "email_address",
				},
				additionalFields: {
					test: {
						type: "string",
						defaultValue: "test",
					},
				},
			},
			session: {
				modelName: "sessions",
			},
		}) satisfies BetterAuthOptions;
	const mysqlOptions = opts({
		db: mysqlKy,
		type: "mysql",
	});
	const sqliteOptions = opts({
		db: sqliteKy,
		type: "sqlite",
	});
	beforeAll(async () => {
		const { runMigrations } = await getMigrations(mysqlOptions);
		await runMigrations();
		const { runMigrations: runMigrationsSqlite } =
			await getMigrations(sqliteOptions);
		await runMigrationsSqlite();
	});

	afterAll(async () => {
		await mysql.query("DROP DATABASE IF EXISTS better_auth");
		await mysql.query("CREATE DATABASE better_auth");
		await mysql.end();
		await fs.unlink(path.join(__dirname, "test.db"));
	});

	const mysqlAdapter = kyselyAdapter(mysqlKy, {
		type: "mysql",
	});
	await runAdapterTest({
		getAdapter: async (customOptions = {}) => {
			return mysqlAdapter({ ...mysqlOptions, ...customOptions });
		},
	});

	const sqliteAdapter = kyselyAdapter(sqliteKy, {
		type: "sqlite",
	});
	await runAdapterTest({
		getAdapter: async (customOptions = {}) => {
			return sqliteAdapter({ ...sqliteOptions, ...customOptions });
		},
	});
});
