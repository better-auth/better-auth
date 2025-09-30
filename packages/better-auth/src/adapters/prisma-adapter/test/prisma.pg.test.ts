import { testAdapter } from "../../test-adapter";
import {
	authFlowTestSuite,
	normalTestSuite,
	numberIdTestSuite,
	performanceTestSuite,
	transactionsTestSuite,
} from "../../tests";
import { prismaAdapter } from "../prisma-adapter";
import { generateAuthConfigFile } from "./generate-auth-config";
import { generatePrismaSchema } from "./generate-prisma-schema";
import { pushPrismaSchema } from "./push-prisma-schema";
import type { BetterAuthOptions } from "../../../types";
import {
	destroyPrismaClient,
	getPrismaClient,
	incrementMigrationCount,
} from "./get-prisma-client";
import { Pool } from "pg";

const dialect = "postgresql";
const { execute } = await testAdapter({
	adapter: async () => {
		const db = await getPrismaClient(dialect);
		return prismaAdapter(db, {
			provider: dialect,
			debugLogs: { isRunningAdapterTests: true },
		});
	},
	runMigrations: async (options: BetterAuthOptions) => {
		const db = await getPrismaClient(dialect);
		const pgDB = new Pool({
			connectionString: "postgres://user:password@localhost:5434/better_auth",
		});
		await pgDB.query(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`);
		await pgDB.end();
		const migrationCount = incrementMigrationCount();
		await generateAuthConfigFile(options);
		await generatePrismaSchema(options, db, migrationCount, dialect);
		await pushPrismaSchema(dialect);
		destroyPrismaClient({ migrationCount: migrationCount - 1, dialect });
	},
	tests: [
		normalTestSuite(),
		transactionsTestSuite(),
		authFlowTestSuite(),
		numberIdTestSuite(),
		performanceTestSuite({ dialect }),
	],
	onFinish: async () => {},
	prefixTests: "pg",
});

execute();
