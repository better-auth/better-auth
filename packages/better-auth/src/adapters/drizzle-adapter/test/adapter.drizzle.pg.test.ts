import { drizzleAdapter } from "../drizzle-adapter";
import { testAdapter } from "../../test-adapter";
import {
	authFlowTestSuite,
	normalTestSuite,
	performanceTestSuite,
	transactionsTestSuite,
} from "../../tests";
import { getMigrations } from "../../../db";
import { drizzle } from "drizzle-orm/node-postgres";
import { generateDrizzleSchema } from "./generate-schema";
import { Pool } from "pg";
import { waitForTestPermission } from "../../../test/adapter-test-setup";

const { done } = await waitForTestPermission("drizzle-pg");

const pgDB = new Pool({
	connectionString: "postgres://user:password@localhost:5432/better_auth",
});

const cleanupDatabase = async (shouldDestroy = false) => {
	await pgDB.query(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`);
	if (shouldDestroy) {
		await pgDB.end();
	}
};

const { execute } = await testAdapter({
	adapter: (options) => {
		return drizzleAdapter(drizzle(pgDB), {
			debugLogs: { isRunningAdapterTests: true },
			schema: generateDrizzleSchema(options, "pg"),
			provider: "pg",
			transaction: true,
		});
	},
	async runMigrations(betterAuthOptions) {
		await cleanupDatabase();
		const options = Object.assign(betterAuthOptions, { database: pgDB });
		const { runMigrations } = await getMigrations(options);
		await runMigrations();
	},
	prefixTests: "pg",
	tests: [
		normalTestSuite(),
		transactionsTestSuite({ disableTests: { ALL: true } }),
		authFlowTestSuite(),
		performanceTestSuite({ dialect: "pg" }),
	],
	async onFinish() {
		await cleanupDatabase(true);
		await done();
	},
});

execute();
