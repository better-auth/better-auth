import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { testAdapter } from "@better-auth/test-utils/adapter";
import { drizzle } from "drizzle-orm/mysql2";
import { createPool } from "mysql2/promise";
import { assert } from "vitest";
import {
	authFlowTestSuite,
	caseInsensitiveTestSuite,
	joinsTestSuite,
	normalTestSuite,
	numberIdTestSuite,
	transactionsTestSuite,
	uuidTestSuite,
} from "../adapter-factory";
import { generateDrizzleSchema, resetGenerationCount } from "./generate-schema";
import { pushDrizzleSchema } from "./push-drizzle-schema";

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

		console.log(`Options:`, betterAuthOptions);
		try {
			await pushDrizzleSchema(
				"mysql",
				`${fileName}.ts`,
				"mysql://user:password@localhost:3306/better_auth",
			);
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
		caseInsensitiveTestSuite({
			disableTests: {
				"findOne - eq with mode sensitive (default) should not match different case": true,
			},
		}),
	],
	async onFinish() {
		await mysqlDB.end();
		resetGenerationCount();
	},
});

execute();
