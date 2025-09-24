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

const mysqlDB = createPool("mysql://user:password@localhost:3306/better_auth");

const { execute } = testAdapter({
	adapter: (options) => {
		return drizzleAdapter(drizzle(mysqlDB), {
			debugLogs: { isRunningAdapterTests: true },
			schema: generateDrizzleSchema(options, "mysql"),
			provider: "mysql",
		});
	},
	async runMigrations(betterAuthOptions) {
		const options = Object.assign(betterAuthOptions, { database: mysqlDB });
		const { runMigrations } = await getMigrations(options);
		await runMigrations();
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
		transactionsTestSuite(),
		authFlowTestSuite(),
		performanceTestSuite(),
	],
});

// biome-ignore lint/nursery/noFloatingPromises: awaiting this will block vitest from starting
execute();
