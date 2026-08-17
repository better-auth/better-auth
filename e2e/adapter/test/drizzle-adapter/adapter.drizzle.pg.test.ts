import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { testAdapter } from "@better-auth/test-utils/adapter";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
	authFlowTestSuite,
	caseInsensitiveTestSuite,
	joinsTestSuite,
	normalTestSuite,
	numberIdTestSuite,
	transactionsTestSuite,
	uuidTestSuite,
} from "../adapter-factory";
import { generateDrizzleSchema, resetGenerationCount } from "./generate-schema";
import { pushDrizzleSchema } from "./push-drizzle-schema";

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
	adapter: async (options) => {
		const { schema } = await generateDrizzleSchema(pgDB, options, "pg");
		return drizzleAdapter(drizzle(pgDB, { schema }), {
			debugLogs: { isRunningAdapterTests: true },
			schema,
			provider: "pg",
			transaction: true,
		});
	},
	async runMigrations(betterAuthOptions) {
		await cleanupDatabase();
		const { fileName } = await generateDrizzleSchema(
			pgDB,
			betterAuthOptions,
			"pg",
		);

		console.log(`Options:`, betterAuthOptions);
		try {
			await pushDrizzleSchema(
				"postgresql",
				`${fileName}.ts`,
				"postgres://user:password@localhost:5432/better_auth",
			);
		} catch (error) {
			console.error("Failed to push drizzle schema (pg):", error);
			throw error;
		}
	},
	prefixTests: "pg",
	tests: [
		normalTestSuite(),
		transactionsTestSuite({ disableTests: { ALL: true } }),
		authFlowTestSuite(),
		numberIdTestSuite(),
		joinsTestSuite(),
		uuidTestSuite(),
		caseInsensitiveTestSuite(),
	],
	async onFinish() {
		await cleanupDatabase(true);
		resetGenerationCount();
	},
});

execute();
