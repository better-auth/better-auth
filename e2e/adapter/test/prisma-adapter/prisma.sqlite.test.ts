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
// SQLite LIKE has no default escape character and Prisma cannot add an ESCAPE
// clause, so `%` and `_` cannot be matched literally.
const noLiteralLike = {
	disableTests: {
		"findMany - contains, starts_with and ends_with should match LIKE wildcards literally": true,
	},
};
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
		await pushPrismaSchema(dialect, db);
		destroyPrismaClient({ migrationCount: migrationCount - 1, dialect });
	},
	tests: [
		normalTestSuite(noLiteralLike),
		transactionsTestSuite(),
		authFlowTestSuite(),
		numberIdTestSuite(noLiteralLike),
		joinsTestSuite(noLiteralLike),
		uuidTestSuite(noLiteralLike),
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
				"findMany - insensitive contains, starts_with and ends_with should match LIKE wildcards literally": true,
			},
		}),
	],
	onFinish: async () => {},
	prefixTests: dialect,
});

execute();
