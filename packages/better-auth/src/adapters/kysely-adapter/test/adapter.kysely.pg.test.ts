import { Kysely, PostgresDialect } from "kysely";
import { testAdapter } from "../../test-adapter";
import { kyselyAdapter } from "../kysely-adapter";
import { Pool } from "pg";
import {
	authFlowTestSuite,
	normalTestSuite,
	numberIdTestSuite,
	performanceTestSuite,
	transactionsTestSuite,
} from "../../tests";
import { getMigrations } from "../../../db";
import type { BetterAuthOptions } from "../../../types";

const pgDB = new Pool({
	connectionString: "postgres://user:password@localhost:5433/better_auth",
});

let kyselyDB = new Kysely({
	dialect: new PostgresDialect({ pool: pgDB }),
});

const cleanupDatabase = async () => {
	await pgDB.query(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`);
};

const { execute } = await testAdapter({
	adapter: () =>
		kyselyAdapter(kyselyDB, {
			type: "postgres",
			debugLogs: { isRunningAdapterTests: true },
		}),
	prefixTests: "pg",
	async runMigrations(betterAuthOptions) {
		await cleanupDatabase();
		const opts = Object.assign(betterAuthOptions, {
			database: pgDB,
		} satisfies BetterAuthOptions);
		const { runMigrations } = await getMigrations(opts);
		await runMigrations();
	},
	tests: [
		normalTestSuite(),
		transactionsTestSuite({ disableTests: { ALL: true } }),
		authFlowTestSuite(),
		numberIdTestSuite(),
		performanceTestSuite({ dialect: "pg" }),
	],
	async onFinish() {
		await pgDB.end();
	},
});
execute();
