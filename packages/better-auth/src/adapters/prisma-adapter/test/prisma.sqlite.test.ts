import fs from "node:fs/promises";
import { join } from "node:path";
import type { BetterAuthOptions } from "@better-auth/core";
import { testAdapter } from "../../test-adapter";
import {
	authFlowTestSuite,
	joinsTestSuite,
	normalTestSuite,
	numberIdTestSuite,
	transactionsTestSuite,
	uuidTestSuite,
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
		normalTestSuite(),
		transactionsTestSuite(),
		authFlowTestSuite(),
		numberIdTestSuite(),
		joinsTestSuite(),
		uuidTestSuite(),
	],
	onFinish: async () => {},
	prefixTests: dialect,
});

execute();
