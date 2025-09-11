import fsPromises from "fs/promises";
import { afterAll, beforeAll, describe } from "vitest";
import { runJoinAdapterTest } from "../../../join-test";
import { getMigrations } from "../../../../db/get-migration";
import path from "path";
import Database from "better-sqlite3";
import { kyselyAdapter } from "../..";
import { Kysely, SqliteDialect, sql } from "kysely";
import type { BetterAuthOptions } from "../../../../types";

const sqlite = new Database(path.join(__dirname, "test-join.db"));
const sqliteKy = new Kysely({
	dialect: new SqliteDialect({
		database: sqlite,
	}),
});

export const opts = (): BetterAuthOptions =>
	({
		database: {
			db: sqliteKy,
			type: "sqlite",
		},
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
			fields: {
				token: "session_token",
			},
		},
		advanced: {
			database: {
				defaultFindManyLimit: 50,
			},
		},
		plugins: [],
	}) satisfies BetterAuthOptions;

describe("kysely adapter - JOIN functionality", async () => {
	const sqliteOptions = opts();

	beforeAll(async () => {
		console.log("Setting up JOIN test database...");
		// Disable foreign key constraints for testing
		await sql`PRAGMA foreign_keys = OFF`.execute(sqliteKy);
		await (await getMigrations(sqliteOptions)).runMigrations();
	});

	afterAll(async () => {
		sqlite.close();
		try {
			await fsPromises.unlink(path.join(__dirname, "test-join.db"));
		} catch (e) {
			// File might not exist
		}
	});

	const sqliteAdapter = kyselyAdapter(sqliteKy, {
		type: "sqlite",
		debugLogs: {
			isRunningAdapterTests: true,
		},
	});

	await runJoinAdapterTest({
		testPrefix: "SQLite JOIN",
		getAdapter: async (customOptions = {}) => {
			return sqliteAdapter({ ...sqliteOptions, ...customOptions });
		},
		tableNames: {
			user: "user",
			session: "sessions", // Custom table name from options
		},
		fieldMappings: {
			userEmail: "email_address", // Custom field mapping from options
			sessionToken: "session_token", // Custom field mapping from options
		},
	});
});
