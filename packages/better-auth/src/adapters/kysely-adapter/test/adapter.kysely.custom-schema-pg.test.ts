import type { BetterAuthOptions } from "@better-auth/core";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import { getMigrations } from "../../../db";
import { testAdapter } from "../../test-adapter";
import {
	authFlowTestSuite,
	joinsTestSuite,
	normalTestSuite,
	numberIdTestSuite,
	transactionsTestSuite,
	uuidTestSuite,
} from "../../tests";
import { kyselyAdapter } from "../kysely-adapter";

/**
 * Test suite for PostgreSQL with custom (non-default) schema
 * This ensures migrations work correctly when using search_path to specify a schema other than 'public'
 */

const CUSTOM_SCHEMA = "auth";

// Connection string with custom schema in search_path
const pgDB = new Pool({
	connectionString: `postgres://user:password@localhost:5435/better_auth?options=-c search_path=${CUSTOM_SCHEMA}`,
});

let kyselyDB = new Kysely({
	dialect: new PostgresDialect({ pool: pgDB }),
});

const cleanupDatabase = async () => {
	// Clean up both public and custom schema
	await pgDB.query(`DROP SCHEMA IF EXISTS ${CUSTOM_SCHEMA} CASCADE`);
	await pgDB.query(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`);
	// Create the custom schema for tests
	await pgDB.query(`CREATE SCHEMA ${CUSTOM_SCHEMA}`);
};

const { execute } = await testAdapter({
	adapter: () =>
		kyselyAdapter(kyselyDB, {
			type: "postgres",
			debugLogs: { isRunningAdapterTests: true },
		}),
	runMigrations: async (options: BetterAuthOptions) => {
		await cleanupDatabase();

		// Verify the custom schema exists
		const schemaCheck = await pgDB.query(
			`SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1`,
			[CUSTOM_SCHEMA],
		);

		if (schemaCheck.rows.length === 0) {
			throw new Error(`Schema '${CUSTOM_SCHEMA}' does not exist`);
		}

		// Run migrations - should create tables in the custom schema
		// Use the Pool connection directly for getMigrations
		const opts = Object.assign(options, { database: pgDB });
		const { runMigrations } = await getMigrations(opts);
		await runMigrations();

		// Verify tables were created in the custom schema, not in public
		const tablesInCustomSchema = await pgDB.query(
			`SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE'`,
			[CUSTOM_SCHEMA],
		);

		const tablesInPublicSchema = await pgDB.query(
			`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
		);

		console.log(
			`Tables in '${CUSTOM_SCHEMA}' schema:`,
			tablesInCustomSchema.rows.map(
				(r: { table_name: string }) => r.table_name,
			),
		);
		console.log(
			"Tables in 'public' schema:",
			tablesInPublicSchema.rows.map(
				(r: { table_name: string }) => r.table_name,
			),
		);

		// Assert that tables exist in custom schema
		if (tablesInCustomSchema.rows.length === 0) {
			throw new Error(
				`No tables were created in schema '${CUSTOM_SCHEMA}'. This indicates the migration did not respect the search_path.`,
			);
		}
	},
	prefixTests: "pg-custom-schema",
	tests: [
		normalTestSuite(),
		transactionsTestSuite(),
		authFlowTestSuite(),
		numberIdTestSuite(),
		uuidTestSuite(),
		joinsTestSuite(),
	],
	async onFinish() {
		// Clean up
		await cleanupDatabase();
		// Destroy Kysely instance
		await kyselyDB.destroy();
	},
});

execute();
