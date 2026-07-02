import type { BetterAuthOptions } from "@better-auth/core";
import { prismaNextAdapter } from "@better-auth/prisma-next-adapter";
import { testAdapter } from "@better-auth/test-utils/adapter";
import { getMigrations } from "better-auth/db/migration";
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
import { DATABASE_URL } from "./constants";
import { createPrismaNextClient } from "./create-prisma-next-client";

const pgPool = new Pool({ connectionString: DATABASE_URL });

const cleanupDatabase = async () => {
	await pgPool.query(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`);
};

const { execute } = await testAdapter({
	adapter: () => {
		const db = createPrismaNextClient(pgPool);
		return prismaNextAdapter(db, {
			debugLogs: { isRunningAdapterTests: true },
		});
	},
	prefixTests: "prisma-next-pg",
	async runMigrations(betterAuthOptions) {
		await cleanupDatabase();
		const opts = Object.assign(betterAuthOptions, {
			database: pgPool,
		} satisfies BetterAuthOptions);
		const { runMigrations } = await getMigrations(opts);
		await runMigrations();
	},
	tests: [
		normalTestSuite(),
		transactionsTestSuite(),
		authFlowTestSuite(),
		numberIdTestSuite(),
		joinsTestSuite(),
		uuidTestSuite({}),
		caseInsensitiveTestSuite(),
	],
	async onFinish() {
		await pgPool.end();
	},
});

execute();
