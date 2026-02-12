import type { BetterAuthOptions } from "@better-auth/core";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { testAdapter } from "@better-auth/test-utils/adapter";
import { Pool } from "pg";
import {
	authFlowTestSuite,
	joinsTestSuite,
	normalTestSuite,
	numberIdTestSuite,
	transactionsTestSuite,
	uuidTestSuite,
} from "../adapter-factory";
import { generateAuthConfigFile } from "./generate-auth-config";
import { generatePrismaSchema } from "./generate-prisma-schema";
import {
	destroyPrismaClient,
	getPrismaClient,
	incrementMigrationCount,
} from "./get-prisma-client";
import { pushPrismaSchema } from "./push-prisma-schema";

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
		joinsTestSuite(),
		uuidTestSuite({}),
	],
	onFinish: async () => {},
	prefixTests: "pg",
});

execute();
