import { execSync } from "node:child_process";
import {
	authFlowTestSuite,
	joinsTestSuite,
	normalTestSuite,
	numberIdTestSuite,
	testAdapter,
	transactionsTestSuite,
	uuidTestSuite,
} from "better-auth/adapters";
import { drizzle } from "drizzle-orm/mysql2";
import { createPool } from "mysql2/promise";
import { assert } from "vitest";
import { drizzleAdapter } from "../drizzle-adapter";
import { generateDrizzleSchema, resetGenerationCount } from "./generate-schema";

const dbName = "drizzle_better_auth";
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

		try {
			const version = execSync("bunx drizzle-kit --version", {
				cwd: import.meta.dirname,
				stdio: ["ignore", "pipe", "pipe"],
			})
				.toString()
				.trim();
			console.log(`bunx drizzle-kit --version output:`, version);
		} catch (err) {
			console.error("Failed to check drizzle-kit version with bunx:", err);
		}

		const command = `npx drizzle-kit push --dialect=mysql --schema=${fileName}.ts --url=mysql://user:password@localhost:3306/${dbName}`;
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
