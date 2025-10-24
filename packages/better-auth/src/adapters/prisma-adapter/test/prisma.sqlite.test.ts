import fs from "node:fs/promises";
import type { BetterAuthOptions } from "@better-auth/core";
import { join } from "path";
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
		const dbPath = join(import.meta.dirname, "dev.db");
		try {
			await fs.unlink(dbPath);
		} catch {
			console.log("db path not found");
		}
		const db = await getPrismaClient(dialect);
		const migrationCount = incrementMigrationCount();
		await generateAuthConfigFile(options);
		await generatePrismaSchema(options, db, migrationCount, dialect);
		await pushPrismaSchema(dialect);
		await db.$disconnect();
		destroyPrismaClient({ migrationCount: migrationCount - 1, dialect });
	},
	tests: [
		normalTestSuite({}),
		transactionsTestSuite(),
		authFlowTestSuite(),
		numberIdTestSuite({}),
		performanceTestSuite({ dialect }),
	],
	onFinish: async () => {},
	prefixTests: dialect,
});

execute();
