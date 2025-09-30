import { Kysely, MysqlDialect } from "kysely";
import { testAdapter } from "../../test-adapter";
import { kyselyAdapter } from "../kysely-adapter";
import { createPool } from "mysql2/promise";
import {
	authFlowTestSuite,
	normalTestSuite,
	numberIdTestSuite,
	performanceTestSuite,
	transactionsTestSuite,
} from "../../tests";
import { getMigrations } from "../../../db";
import { assert } from "vitest";

const mysqlDB = createPool({
	uri: "mysql://user:password@localhost:3307/better_auth",
	timezone: "Z",
});

let kyselyDB = new Kysely({
	dialect: new MysqlDialect(mysqlDB),
});

const { execute } = await testAdapter({
	adapter: () =>
		kyselyAdapter(kyselyDB, {
			type: "mysql",
			debugLogs: { isRunningAdapterTests: true },
		}),
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
		normalTestSuite(),
		transactionsTestSuite({ disableTests: { ALL: true } }),
		authFlowTestSuite(),
		numberIdTestSuite(),
		performanceTestSuite({ dialect: "mysql" }),
	],
	async onFinish() {
		await mysqlDB.end();
	},
});
execute();
