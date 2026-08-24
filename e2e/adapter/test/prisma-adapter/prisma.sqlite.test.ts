import type { BetterAuthOptions } from "@better-auth/core";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { testAdapter } from "@better-auth/test-utils/adapter";
import {
	authFlowTestSuite,
	caseInsensitiveTestSuite,
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

const dialect = "sqlite";
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
		uuidTestSuite(),
		caseInsensitiveTestSuite({
			disableTests: {
				"findOne - eq with mode insensitive should match regardless of case": true,
				"findMany - eq with mode insensitive": true,
				"findMany - ne with mode insensitive": true,
				"findMany - in with mode insensitive": true,
				"findMany - not_in with mode insensitive": true,
				"count - with mode insensitive": true,
				"update - where with mode insensitive": true,
				"deleteMany - where with mode insensitive": true,
			},
		}),
	],
	onFinish: async () => {},
	prefixTests: dialect,
});

execute();
