import { testAdapter } from "../../test-adapter";
import {
	authFlowTestSuite,
	normalTestSuite,
	performanceTestSuite,
	transactionsTestSuite,
} from "../../tests";
import { prismaAdapter } from "../prisma-adapter";
import { waitForTestPermission } from "../../../test/adapter-test-setup";
import { generateAuthConfigFile } from "./generate-auth-config";
import { generatePrismaSchema } from "./generate-prisma-schema";
import { pushPrismaSchema } from "./push-prisma-schema";
import type { BetterAuthOptions } from "../../../types";
import { join } from "path";
import fs from "node:fs/promises";
import {
	destroyPrismaClient,
	getPrismaClient,
	incrementMigrationCount,
} from "./get-prisma-client";

const { done } = await waitForTestPermission("prisma-sqlite");

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
		const dbPath = join(__dirname, "dev.db");
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
		db.$disconnect();
		destroyPrismaClient({ migrationCount: migrationCount - 1, dialect });
	},
	tests: [
		normalTestSuite(),
		transactionsTestSuite(),
		authFlowTestSuite(),
		performanceTestSuite(),
	],
	onFinish: async () => {
		await done();
	},
	prefixTests: dialect,
});

execute();
