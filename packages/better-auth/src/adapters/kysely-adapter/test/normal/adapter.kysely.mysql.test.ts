import { Kysely, MysqlDialect } from "kysely";
import { testAdapter } from "../../../test-adapter";
import { kyselyAdapter } from "../../kysely-adapter";
import { createPool } from "mysql2/promise";
import {
	authFlowTestSuite,
	normalTestSuite,
	performanceTestSuite,
	transactionsTestSuite,
} from "../../../tests";
import { getMigrations } from "../../../../db";

const mysqlDB = createPool({
	uri: "mysql://user:password@localhost:3306/better_auth",
	timezone: "Z",
});

let kyselyDB = new Kysely({
	dialect: new MysqlDialect(mysqlDB),
});

const showDB = async () => {
	const q = async (s: string) => await mysqlDB.execute(s);
	const DB = {
		users: (await q("SELECT * FROM user"))[0],
		sessions: await q("SELECT * FROM session"),
		accounts: await q("SELECT * FROM account"),
		verifications: await q("SELECT * FROM verification"),
	};
	console.log(`DB`, DB);
};

const { execute } = testAdapter({
	adapter: () => kyselyAdapter(kyselyDB, { type: "mysql" }),
	async runMigrations(betterAuthOptions) {
		await mysqlDB.query("DROP DATABASE IF EXISTS better_auth");
		await mysqlDB.query("CREATE DATABASE better_auth");
		await mysqlDB.query("USE better_auth");
		const opts = Object.assign(betterAuthOptions, { database: mysqlDB });
		const { runMigrations } = await getMigrations(opts);
		await runMigrations();
	},
	prefixTests: "mysql",
	tests: [
		normalTestSuite({
			showDB,
			async testFn() {
				const [rows] = await mysqlDB.query("SELECT * FROM user");
				console.log(rows);
			},
			// disableTests: { ALL: true, "create - should create a model": false },
		}),
		transactionsTestSuite({ disableTests: { ALL: true } }),
		authFlowTestSuite({ showDB }),
		performanceTestSuite(),
	],
	async onFinish() {
		await mysqlDB.end();
	},
});

execute();
