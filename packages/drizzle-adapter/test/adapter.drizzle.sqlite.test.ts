import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import {
	authFlowTestSuite,
	joinsTestSuite,
	normalTestSuite,
	numberIdTestSuite,
	testAdapter,
	transactionsTestSuite,
	uuidTestSuite,
} from "better-auth/adapters/test-adapter";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
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
		const { relations, ...schemas } = schema;
		return drizzleAdapter(
			drizzle({ client: sqliteDB, schema: schemas, relations }),
			{
				debugLogs: { isRunningAdapterTests: true },
				schema: { ...schemas, relations },
				provider: "sqlite",
			},
		);
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

		const command = `node ./node_modules/drizzle-kit/bin.cjs push --dialect=sqlite --schema=${path.join(import.meta.dirname, fileName)}.ts --url="${dbFilePath}"`;
		console.log(`Running: ${command}`);
		console.log(`Options:`, betterAuthOptions);
		try {
			// wait for the above console.log to be printed
			await new Promise((resolve) => setTimeout(resolve, 10));

			execSync(command, {
				cwd: path.join(import.meta.dirname, ".."),
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
		sqliteDB.close();
	},
});

execute();
