import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { testAdapter } from "../../test-adapter";
import {
	authFlowTestSuite,
	joinsTestSuite,
	normalTestSuite,
	numberIdTestSuite,
	transactionsTestSuite,
	uuidTestSuite,
} from "../../tests";
import { drizzleAdapter } from "../drizzle-adapter";
import {
	clearSchemaCache,
	generateDrizzleSchema,
	resetGenerationCount,
} from "./generate-schema";

const dbFilePath = path.join(import.meta.dirname, "test.db");
let sqliteDB = new Database(dbFilePath);

const { execute } = await testAdapter({
	adapter: async (options) => {
		const { schema } = await generateDrizzleSchema(sqliteDB, options, "sqlite");
		return drizzleAdapter(drizzle(sqliteDB, { schema }), {
			debugLogs: { isRunningAdapterTests: true },
			schema,
			provider: "sqlite",
		});
	},
	async runMigrations(betterAuthOptions) {
		sqliteDB.close();
		try {
			await fs.unlink(dbFilePath);
		} catch {
			console.log("db file not found");
		}
		sqliteDB = new Database(dbFilePath);

		const { fileName } = await generateDrizzleSchema(
			sqliteDB,
			betterAuthOptions,
			"sqlite",
		);

		const command = `npx drizzle-kit push --dialect=sqlite --schema=${fileName}.ts --url=./test.db`;
		console.log(`Running: ${command}`);
		console.log(`Options:`, betterAuthOptions);
		try {
			// wait for the above console.log to be printed
			await new Promise((resolve) => setTimeout(resolve, 10));
			execSync(command, {
				cwd: import.meta.dirname,
				stdio: "inherit",
			});
		} catch (error) {
			console.error("Failed to push drizzle schema (sqlite):", error);
			throw error;
		}
	},
	prefixTests: "sqlite",
	tests: [
		normalTestSuite(),
		transactionsTestSuite({ disableTests: { ALL: true } }),
		authFlowTestSuite(),
		numberIdTestSuite(),
		joinsTestSuite(),
		uuidTestSuite(),
	],
	async onFinish() {
		clearSchemaCache();
		resetGenerationCount();
	},
});

execute();
