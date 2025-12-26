import { execSync } from "node:child_process";
import {
	authFlowTestSuite,
	joinsTestSuite,
	normalTestSuite,
	numberIdTestSuite,
	testAdapter,
	transactionsTestSuite,
	uuidTestSuite,
} from "better-auth/adapters";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { drizzleAdapter } from "../drizzle-adapter";
import { generateDrizzleSchema, resetGenerationCount } from "./generate-schema";

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
		const { relations, ...schemas } = schema;
		return drizzleAdapter(
			drizzle({
				client: pgDB,
				relations,
				schema: schemas,
			}),
			{
				debugLogs: { isRunningAdapterTests: true },
				schema: { ...schemas, relations },
				provider: "pg",
			},
		);
	},
	async runMigrations(betterAuthOptions) {
		await cleanupDatabase();
		const { fileName } = await generateDrizzleSchema(
			pgDB,
			betterAuthOptions,
			"pg",
		);

		const command = `npx drizzle-kit push --dialect=postgresql --schema=${fileName}.ts --url=postgres://user:password@localhost:5432/better_auth`;
		console.log(`Running: ${command}`);
		console.log(`Options:`, betterAuthOptions);
		try {
			// wait for the above console.log to be printed
			await new Promise((resolve) => setTimeout(resolve, 10));
			execSync(command, {
				cwd: import.meta.dirname,
				stdio: "inherit",
			});
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
	],
	async onFinish() {
		await cleanupDatabase(true);
		resetGenerationCount();
	},
});

execute();
