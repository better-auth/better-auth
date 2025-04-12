import merge from "deepmerge";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import { afterAll, beforeAll, describe } from "vitest";
import { runNumberIdAdapterTest } from "../../../test";
import path from "path";
import Database from "better-sqlite3";
import { kyselyAdapter } from "../..";
import { Kysely, MysqlDialect, SqliteDialect } from "kysely";
import { createPool } from "mysql2/promise";
import { getState, stateFilePath } from "../state";
import { getMigrations } from "../../../../db/get-migration";
import type { BetterAuthOptions } from "../../../../types";

export const opts = ({
	database,
	isNumberIdTest,
}: { database: BetterAuthOptions["database"]; isNumberIdTest: boolean }) =>
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
		advanced: {
			database: {
				useNumberId: isNumberIdTest,
			},
		},
	}) satisfies BetterAuthOptions;

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

describe("Number ID Adapter tests", async () => {
	const mysqlOptions = opts({
		database: {
			db: mysqlKy,
			type: "mysql",
		},
		isNumberIdTest: true,
	});
	const sqliteOptions = opts({
		database: {
			db: sqliteKy,
			type: "sqlite",
		},
		isNumberIdTest: true,
	});

	beforeAll(async () => {
		await new Promise(async (resolve) => {
			await new Promise((r) => setTimeout(r, 800));
			if (getState() === "IDLE") {
				resolve(true);
				return;
			}
			console.log(`Waiting for state to be IDLE...`);
			fs.watch(stateFilePath, () => {
				if (getState() === "IDLE") {
					resolve(true);
					return;
				}
			});
		});
		console.log(`Now running Number ID Kysely adapter test...`);
		await (await getMigrations(mysqlOptions)).runMigrations();
		await (await getMigrations(sqliteOptions)).runMigrations();
	});

	afterAll(async () => {
		await mysql.query("DROP DATABASE IF EXISTS better_auth");
		await mysql.query("CREATE DATABASE better_auth");
		await mysql.end();
		await fsPromises.unlink(path.join(__dirname, "test.db"));
	});

	const mysqlAdapter = kyselyAdapter(mysqlKy, {
		type: "mysql",
		debugLogs: {
			isRunningAdapterTests: false,
		},
	});
	await runNumberIdAdapterTest({
		getAdapter: async (customOptions = {}) => {
			const merged = merge(customOptions, mysqlOptions);
			return mysqlAdapter(merged);
		},
		testPrefix: "mysql",
	});

	const sqliteAdapter = kyselyAdapter(sqliteKy, {
		type: "sqlite",
		debugLogs: {
			isRunningAdapterTests: false,
		},
	});

	await runNumberIdAdapterTest({
		getAdapter: async (customOptions = {}) => {
			return sqliteAdapter(merge(customOptions, sqliteOptions));
		},
		testPrefix: "sqlite",
	});
});
