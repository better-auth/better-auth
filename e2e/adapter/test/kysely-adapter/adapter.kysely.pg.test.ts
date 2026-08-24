import type { BetterAuthOptions } from "@better-auth/core";
import { kyselyAdapter } from "@better-auth/kysely-adapter";
import { testAdapter } from "@better-auth/test-utils/adapter";
import { getMigrations } from "better-auth/db/migration";
import { Kysely, PostgresDialect } from "kysely";
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
import { compoundIndexTestSuite } from "../adapter-factory/compound-index-test-suite";
import { scimHttpTestSuite } from "../adapter-factory/scim-http-test-suite";
import {
	DEFAULT_SCHEMA_REFERENCE,
	schemaRefJoinTestSuite,
	schemaRefTestSuite,
} from "./schema-reference-test-suite";

const pgDB = new Pool({
	connectionString: "postgres://user:password@localhost:5433/better_auth",
});

const kyselyDB = new Kysely({
	dialect: new PostgresDialect({ pool: pgDB }),
});

const cleanupDatabase = async () => {
	await pgDB.query(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`);
	await pgDB.query(
		`DROP SCHEMA IF EXISTS "${DEFAULT_SCHEMA_REFERENCE}" CASCADE; CREATE SCHEMA "${DEFAULT_SCHEMA_REFERENCE}";`,
	);
};

const { execute } = await testAdapter({
	adapter: () =>
		kyselyAdapter(kyselyDB, {
			type: "postgres",
			debugLogs: { isRunningAdapterTests: true },
			transaction: true,
		}),
	prefixTests: "pg",
	async runMigrations(betterAuthOptions) {
		await cleanupDatabase();
		const opts = Object.assign(betterAuthOptions, {
			database: pgDB,
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
		uuidTestSuite(),
		caseInsensitiveTestSuite(),
		schemaRefTestSuite(),
		schemaRefJoinTestSuite(),
		scimHttpTestSuite({
			connectionId: "kysely-postgres-workforce",
			token: "kysely-postgres-scim-token",
			testId: "kysely-postgres",
		}),
		compoundIndexTestSuite({
			async rerunMigrations(options) {
				const migrations = await getMigrations({ ...options, database: pgDB });
				const pendingMigration = await migrations.compileMigrations();
				await migrations.runMigrations();
				return pendingMigration;
			},
			mismatchError:
				'Database index "compound_identity_uidx" on table "compound_index_subject" does not match the configured fields and uniqueness.',
			async verifyMismatchedIndexRejected(options) {
				await pgDB.query(`
					DROP INDEX "compound_identity_uidx";
					CREATE INDEX "compound_identity_uidx"
						ON "compound_index_subject" ("provider_subject");
				`);
				try {
					await getMigrations({ ...options, database: pgDB });
				} finally {
					await pgDB.query(`
						DROP INDEX IF EXISTS "compound_identity_uidx";
						CREATE UNIQUE INDEX "compound_identity_uidx"
							ON "compound_index_subject" ("issuer_url", "provider_subject");
					`);
				}
			},
		}),
	],
	async onFinish() {
		await pgDB.end();
	},
});
execute();
