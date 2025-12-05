import { execSync } from "node:child_process";
import { drizzle } from "drizzle-orm/mysql2";
import { createPool } from "mysql2/promise";
import { assert } from "vitest";
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
import { generateDrizzleSchema, resetGenerationCount } from "./generate-schema";

const mysqlDB = createPool({
	uri: "mysql://user:password@localhost:3306/better_auth",
	timezone: "Z",
});

const { execute } = await testAdapter({
	adapter: async (options) => {
		const { schema } = await generateDrizzleSchema(mysqlDB, options, "mysql");
		return drizzleAdapter(drizzle(mysqlDB, { schema, mode: "default" }), {
			debugLogs: { isRunningAdapterTests: true },
			schema,
			provider: "mysql",
		});
	},
	async runMigrations(betterAuthOptions) {
		await mysqlDB.query("DROP DATABASE IF EXISTS better_auth");
		await mysqlDB.query("CREATE DATABASE better_auth");
		await mysqlDB.query("USE better_auth");

		const { fileName } = await generateDrizzleSchema(
			mysqlDB,
			betterAuthOptions,
			"mysql",
		);

		const command = `npx drizzle-kit push --dialect=mysql --schema=${fileName}.ts --url=mysql://user:password@localhost:3306/better_auth`;
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
			console.error("Failed to push drizzle schema (mysql):", error);
			throw error;
		}

		// ensure migrations were run successfully
		const [tables_result] = (await mysqlDB.query("SHOW TABLES")) as unknown as [
			{ Tables_in_better_auth: string }[],
		];
		const tables = tables_result.map((table) => table.Tables_in_better_auth);
		assert(tables.length > 0, "No tables found");
	},
	prefixTests: "mysql",
	tests: [
		normalTestSuite(),
		transactionsTestSuite({ disableTests: { ALL: true } }),
		authFlowTestSuite(),
		numberIdTestSuite(),
		joinsTestSuite(),
		uuidTestSuite(),
	],
	async onFinish() {
		await mysqlDB.end();
		resetGenerationCount();
	},
});

execute();
