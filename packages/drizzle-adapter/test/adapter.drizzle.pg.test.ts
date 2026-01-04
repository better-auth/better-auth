import { execSync } from "node:child_process";
import {
	authFlowTestSuite,
	joinsTestSuite,
	normalTestSuite,
	numberIdTestSuite,
	testAdapter,
	transactionsTestSuite,
	uuidTestSuite,
} from "better-auth/adapters/test-adapter";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { drizzleAdapter } from "../drizzle-adapter";
import { generateDrizzleSchema, resetGenerationCount } from "./generate-schema";
import { getDrizzleVersion, installBetaDrizzle } from "./drizzle-cli-utils";

const dbName = "better_auth";
const pgDB = new Pool({
	connectionString: `postgres://user:password@localhost:5432/${dbName}`,
});

const cleanupDatabase = async (shouldDestroy = false) => {
	await pgDB.query(` DROP SCHEMA public CASCADE;
    CREATE SCHEMA public;
    GRANT ALL ON SCHEMA public TO "${process.env.POSTGRES_USER ?? "user"}";
    GRANT ALL ON SCHEMA public TO public;`);
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

		// Even if we defined the same drizzle-orm version in the package.json,
		// CI wouldn't wouldn't run the same drizzle beta version between drizzle-kit and drizzle-orm which causes the push command
		// to fail as Drizzle-kit will ask for the same orm version.
		// This is a workaround to install the beta drizzle-orm live if the version mismatch is detected.
		// const version = await getDrizzleVersion();
		// if (version.kit !== version.orm) {
		// }

		const command = `npm i drizzle-orm@beta && npx drizzle-kit@beta push --dialect=postgresql --schema=${fileName}.ts --url=postgres://user:password@localhost:5432/${dbName}`;
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
