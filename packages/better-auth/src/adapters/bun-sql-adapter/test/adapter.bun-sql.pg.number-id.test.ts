import type { BetterAuthOptions } from "@better-auth/core";
import { SQL } from "bun";
import { Pool } from "pg";
import { getMigrations } from "../../../db";
import { testAdapter } from "../../test-adapter";
import { numberIdTestSuite } from "../../tests";
import { bunSqlAdapter } from "../bun-sql-adapter";

// Use pg Pool for migrations (getMigrations uses Kysely internally)
const pgPool = new Pool({
	connectionString: "postgres://user:password@localhost:5435/better_auth",
});

// Use Bun SQL for the actual adapter operations
// prepare: false disables prepared statement caching which causes
// "cached plan must not change result type" errors when schema changes mid-test
const bunSql = new SQL({
	hostname: "localhost",
	port: 5435,
	database: "better_auth",
	username: "user",
	password: "password",
	prepare: false,
});

const cleanupDatabase = async () => {
	await pgPool.query(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`);
};

const { execute } = await testAdapter({
	adapter: () =>
		bunSqlAdapter({
			sql: bunSql,
			debugLogs: { isRunningAdapterTests: true },
		}),
	prefixTests: "pg",
	async runMigrations(betterAuthOptions) {
		await cleanupDatabase();
		const opts = Object.assign(betterAuthOptions, {
			database: pgPool,
		} satisfies BetterAuthOptions);
		const { runMigrations } = await getMigrations(opts);
		await runMigrations();
	},
	tests: [numberIdTestSuite()],
	async onFinish() {
		await pgPool.end();
		bunSql.close();
	},
});

execute();
