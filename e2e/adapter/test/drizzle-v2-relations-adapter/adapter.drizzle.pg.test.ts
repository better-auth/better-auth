import { execSync } from "node:child_process";
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
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
		const { authRelations: relations, ...schemas } = schema;
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
				transaction: true,
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

		const command = `npx drizzle-kit push --dialect=postgresql --schema=${fileName}.ts --url=postgres://user:password@localhost:5432/${dbName}`;
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
		transactionsTestSuite(),
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
