import type { BetterAuthOptions } from "@better-auth/core";
import { createPool } from "mysql2/promise";
import { testAdapter } from "../../test-adapter";
import {
	authFlowTestSuite,
	normalTestSuite,
	numberIdTestSuite,
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

const dialect = "mysql";
const { execute } = await testAdapter({
	adapter: async () => {
		const db = await getPrismaClient(dialect);
		return prismaAdapter(db, {
			provider: dialect,
			debugLogs: { isRunningAdapterTests: true },
			experimental: {
				joins: true,
			},
		});
	},
	runMigrations: async (options: BetterAuthOptions) => {
		const mysqlDB = createPool({
			uri: "mysql://user:password@localhost:3308/better_auth",
			timezone: "Z",
		});
		await mysqlDB.query("DROP DATABASE IF EXISTS better_auth");
		await mysqlDB.query("CREATE DATABASE better_auth");
		await mysqlDB.end();
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
	],
	onFinish: async () => {},
	prefixTests: dialect,
});

execute();
