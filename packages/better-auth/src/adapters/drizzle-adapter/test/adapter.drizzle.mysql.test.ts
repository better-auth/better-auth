import { drizzleAdapter } from "../drizzle-adapter";
import { testAdapter } from "../../test-adapter";
import {
	authFlowTestSuite,
	normalTestSuite,
	performanceTestSuite,
	transactionsTestSuite,
} from "../../tests";
import { getMigrations } from "../../../db";
import { drizzle } from "drizzle-orm/mysql2";
import { generateDrizzleSchema } from "./generate-schema";
import { createPool } from "mysql2/promise";
import { assert } from "vitest";
import { waitUntilTestsAreDone } from "../../../test/adapter-test-setup";

const { done } = await waitUntilTestsAreDone({
	thisTest: "drizzle-mysql",
	waitForTests: [],
});

const mysqlDB = createPool({
	uri: "mysql://user:password@localhost:3306/better_auth",
	timezone: "Z",
});

const { execute } = testAdapter({
	adapter: (options) => {
		return drizzleAdapter(drizzle(mysqlDB), {
			debugLogs: { isRunningAdapterTests: true },
			schema: generateDrizzleSchema(options, "mysql"),
			provider: "mysql",
		});
	},
	async runMigrations(betterAuthOptions) {
		await mysqlDB.query("DROP DATABASE IF EXISTS better_auth");
		await mysqlDB.query("CREATE DATABASE better_auth");
		await mysqlDB.query("USE better_auth");
		const opts = Object.assign(betterAuthOptions, { database: mysqlDB });
		const { runMigrations } = await getMigrations(opts);
		await runMigrations();

		// ensure migrations were run successfully
		const [tables_result] = (await mysqlDB.query("SHOW TABLES")) as unknown as [
			{ Tables_in_better_auth: string }[],
		];
		const tables = tables_result.map((table) => table.Tables_in_better_auth);
		assert(tables.length > 0, "No tables found");
		assert(
			!["user", "session", "account", "verification"].find(
				(x) => !tables.includes(x),
			),
			"No tables found",
		);
	},
	prefixTests: "mysql",
	tests: [
		normalTestSuite({
			async showDB() {
				const q = async (s: string) => (await mysqlDB.prepare(s)).execute([]);
				const DB = {
					users: await q("SELECT * FROM user"),
					sessions: await q("SELECT * FROM session"),
					accounts: await q("SELECT * FROM account"),
					verifications: await q("SELECT * FROM verification"),
				};
				console.log(DB);
			},
		}),
		transactionsTestSuite({ disableTests: { ALL: true } }),
		authFlowTestSuite(),
		performanceTestSuite({ dialect: "mysql" }),
	],
	async onFinish() {
		await mysqlDB.end();
		await done();
	},
});

// biome-ignore lint/nursery/noFloatingPromises: awaiting this will block vitest from starting
execute();
