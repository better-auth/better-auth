import { execSync } from "node:child_process";
import path from "node:path";
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { testAdapter } from "@better-auth/test-utils/adapter";
import { drizzle } from "drizzle-orm/mysql2";
import { createPool } from "mysql2/promise";
import { assert } from "vitest";
import {
	authFlowTestSuite,
	joinsTestSuite,
	normalTestSuite,
	numberIdTestSuite,
	transactionsTestSuite,
	uuidTestSuite,
} from "../adapter-factory";
import { generateDrizzleSchema, resetGenerationCount } from "./generate-schema";

const dbName = "better_auth";
const mysqlDB = createPool({
	uri: `mysql://user:password@127.0.0.1:3306/${dbName}`,
	timezone: "Z",
});

const { execute } = await testAdapter({
	adapter: async (options) => {
		const { schema } = await generateDrizzleSchema(mysqlDB, options, "mysql");
		const { relations, ...schema1 } = schema;
		const drizzleI2 = drizzle({
			client: mysqlDB,
			mode: "default",
			schema: schema1,
			relations: relations,
		});
		return drizzleAdapter(drizzleI2, {
			debugLogs: { isRunningAdapterTests: true },
			schema,
			provider: "mysql",
		});
	},
	async runMigrations(betterAuthOptions) {
		await mysqlDB.query(`DROP DATABASE IF EXISTS ${dbName}`);
		await mysqlDB.query(`CREATE DATABASE IF NOT EXISTS ${dbName}`);
		await mysqlDB.query(`USE ${dbName}`);

		const { fileName } = await generateDrizzleSchema(
			mysqlDB,
			betterAuthOptions,
			"mysql",
		);

		const command = `node ./node_modules/drizzle-kit/bin.cjs push --dialect=mysql --schema=${path.join(import.meta.dirname, fileName)}.ts --url=mysql://user:password@localhost:3306/${dbName}`;
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
