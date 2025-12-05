import type { BetterAuthOptions } from "@better-auth/core";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import { getMigrations } from "../../../db";
import { testAdapter } from "../../test-adapter";
import {
	authFlowTestSuite,
	joinsTestSuite,
	normalTestSuite,
	numberIdTestSuite,
	transactionsTestSuite,
	uuidTestSuite,
	uuidv7TestSuite,
} from "../../tests";
import { kyselyAdapter } from "../kysely-adapter";
import {
	DEFAULT_SCHEMA_REFERENCE,
	schemaRefJoinTestSuite,
	schemaRefTestSuite,
} from "./schema-reference-test-suite";

const pgDB = new Pool({
	connectionString: "postgres://user:password@localhost:5433/better_auth",
});

let kyselyDB = new Kysely({
	dialect: new PostgresDialect({ pool: pgDB }),
});

const cleanupDatabase = async () => {
	await pgDB.query(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`);
	await pgDB.query(
		`DROP SCHEMA IF EXISTS "${DEFAULT_SCHEMA_REFERENCE}" CASCADE; CREATE SCHEMA "${DEFAULT_SCHEMA_REFERENCE}";`,
	);
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
		const { runMigrations, compileMigrations } = await getMigrations(opts);
		await runMigrations();
	},
	tests: [
		normalTestSuite(),
		transactionsTestSuite({ disableTests: { ALL: true } }),
		authFlowTestSuite(),
		numberIdTestSuite(),
		joinsTestSuite(),
		uuidTestSuite(),
		uuidv7TestSuite(),
		schemaRefTestSuite(),
		schemaRefJoinTestSuite(),
	],
	async onFinish() {
		await pgDB.end();
	},
});
execute();
