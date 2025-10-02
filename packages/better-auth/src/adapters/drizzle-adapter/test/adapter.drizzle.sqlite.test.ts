import Database from "better-sqlite3";
import { drizzleAdapter } from "../drizzle-adapter";
import { testAdapter } from "../../test-adapter";
import {
	authFlowTestSuite,
	normalTestSuite,
	numberIdTestSuite,
	performanceTestSuite,
	transactionsTestSuite,
} from "../../tests";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "path";
import {
	clearSchemaCache,
	generateDrizzleSchema,
	resetGenerationCount,
} from "./generate-schema";
import fs from "fs/promises";
import { execSync } from "child_process";

const dbFilePath = path.join(import.meta.dirname, "test.db");
let sqliteDB = new Database(dbFilePath);

const { execute } = await testAdapter({
	adapter: async (options) => {
		const { schema } = await generateDrizzleSchema(sqliteDB, options, "sqlite");
		return drizzleAdapter(drizzle(sqliteDB), {
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
		performanceTestSuite({ dialect: "sqlite" }),
	],
	async onFinish() {
		clearSchemaCache();
		resetGenerationCount();
	},
});

execute();
