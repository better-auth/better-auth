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
import fs from "fs/promises";
import type { PrismaClient } from "@prisma/client";

type PC = InstanceType<typeof PrismaClient>;

const { done } = await waitForTestPermission("prisma-sqlite");

let migrationCount = 0;
const getPrismaClient = async () => {
	const { PrismaClient } = await import(
		migrationCount === 0
			? "@prisma/client"
			: `./.tmp/prisma-client-${migrationCount}`
	);
	const db = new PrismaClient();
	return db as PC;
};

const { execute } = await testAdapter({
	adapter: async (options) => {
		const db = await getPrismaClient();
		return (o) => {
			return prismaAdapter(db, {
				provider: "sqlite",
				debugLogs: { isRunningAdapterTests: true },
			})(o);
		};
	},
	runMigrations: async (options: BetterAuthOptions) => {
		const dbPath = join(__dirname, "dev.db");
		await fs.unlink(dbPath);
		migrationCount++;
		const db = await getPrismaClient();
		await generateAuthConfigFile(options);
		await generatePrismaSchema(options, db, migrationCount);
		await pushPrismaSchema();
		db.$disconnect();
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
	prefixTests: "sqlite"
});

execute();
