import type { BetterAuthOptions } from "@better-auth/core";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import { getMigrations } from "../../../db";
import { testAdapter } from "../../test-adapter";
import {
	authFlowTestSuite,
	normalTestSuite,
	numberIdTestSuite,
	transactionsTestSuite,
} from "../../tests";
import { kyselyAdapter } from "../kysely-adapter";

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
			experimental: { joins: true },
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
	],
	async onFinish() {
		await pgDB.end();
	},
});
execute();
