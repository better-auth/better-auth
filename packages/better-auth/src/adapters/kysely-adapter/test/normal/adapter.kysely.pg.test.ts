import { Kysely, PostgresDialect } from "kysely";
import { testAdapter } from "../../../test-adapter";
import { kyselyAdapter } from "../../kysely-adapter";
import { Pool } from "pg";
import {
	authFlowTestSuite,
	normalTestSuite,
	performanceTestSuite,
	transactionsTestSuite,
} from "../../../tests";
import { getMigrations } from "../../../../db";

const pgDB = new Pool({
	connectionString: "postgres://user:password@localhost:5432/better_auth",
});

let kyselyDB = new Kysely({
	dialect: new PostgresDialect({ pool: pgDB }),
});

const cleanupDatabase = async () => {
	await pgDB.query(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`);
};

const { execute } = testAdapter({
	adapter: () => kyselyAdapter(kyselyDB, { type: "postgres" }),
	prefixTests: "pg",
	async runMigrations(betterAuthOptions) {
		await cleanupDatabase();
		const opts = Object.assign(betterAuthOptions, { database: pgDB });
		const { runMigrations } = await getMigrations(opts);
		await runMigrations();
	},
	tests: [
		normalTestSuite(),
		transactionsTestSuite(),
		authFlowTestSuite(),
		performanceTestSuite(),
	],
	async onFinish() {
		await pgDB.end();
	},
});

execute();
