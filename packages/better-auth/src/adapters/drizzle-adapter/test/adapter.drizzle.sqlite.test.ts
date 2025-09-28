import Database from "better-sqlite3";
import { drizzleAdapter } from "../drizzle-adapter";
import { testAdapter } from "../../test-adapter";
import {
	authFlowTestSuite,
	normalTestSuite,
	performanceTestSuite,
	transactionsTestSuite,
} from "../../tests";
import { getMigrations } from "../../../db";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "path";
import { generateDrizzleSchema } from "./generate-schema";
import fs from "fs/promises";
import { waitForTestPermission } from "../../../test/adapter-test-setup";

const { done } = await waitForTestPermission("drizzle-sqlite");

const dbFilePath = path.join(__dirname, "test.db");
let sqliteDB = new Database(dbFilePath);

const { execute } = await testAdapter({
	adapter: (options) => {
		return drizzleAdapter(drizzle(sqliteDB), {
			debugLogs: { isRunningAdapterTests: true },
			schema: generateDrizzleSchema(options, "sqlite"),
			provider: "sqlite",
		});
	},
	async runMigrations(betterAuthOptions) {
		sqliteDB.close();
		if (await fs.lstat(dbFilePath)) {
			await fs.unlink(dbFilePath);
		}
		sqliteDB = new Database(dbFilePath);
		const options = Object.assign(betterAuthOptions, { database: sqliteDB });
		const { runMigrations } = await getMigrations(options);
		await runMigrations();
	},
	prefixTests: "sqlite",
	tests: [
		normalTestSuite({
			showDB() {
				const DB = {
					users: sqliteDB.prepare("SELECT * FROM user").all(),
					sessions: sqliteDB.prepare("SELECT * FROM session").all(),
					accounts: sqliteDB.prepare("SELECT * FROM account").all(),
					verifications: sqliteDB.prepare("SELECT * FROM verification").all(),
				};
				console.log(DB);
			},
		}),
		transactionsTestSuite({ disableTests: { ALL: true } }), // Transactions are not supported for SQLite
		authFlowTestSuite(),
		performanceTestSuite({ dialect: "sqlite" }),
	],
	async onFinish() {
		await done();
	},
});

execute();
