import { kyselyAdapter } from "@better-auth/kysely-adapter";
import { testAdapter } from "@better-auth/test-utils/adapter";
import { getMigrations } from "better-auth/db/migration";
import { Kysely, MysqlDialect } from "kysely";
import { createPool } from "mysql2/promise";
import { assert } from "vitest";
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

const mysqlDB = createPool({
	uri: "mysql://user:password@localhost:3307/better_auth",
	timezone: "Z",
});

const kyselyDB = new Kysely({
	dialect: new MysqlDialect(mysqlDB),
});

const { execute } = await testAdapter({
	adapter: () =>
		kyselyAdapter(kyselyDB, {
			type: "mysql",
			debugLogs: { isRunningAdapterTests: true },
		}),
	async runMigrations(betterAuthOptions) {
		await mysqlDB.query("DROP DATABASE IF EXISTS better_auth");
		await mysqlDB.query("CREATE DATABASE better_auth");
		await mysqlDB.query("USE better_auth");
		const opts = Object.assign(betterAuthOptions, { database: mysqlDB });
		const { runMigrations } = await getMigrations(opts);
		await runMigrations();

		// ensure migrations were run successfully
		const [tables_result] = (await mysqlDB.query("SHOW TABLES")) as unknown as [
			{ Tables_in_better_auth: string }[],
		];
		const tables = tables_result.map((table) => table.Tables_in_better_auth);
		assert(tables.length > 0, "No tables found");
	},
	prefixTests: "mysql",
	tests: [
		normalTestSuite(),
		transactionsTestSuite({ disableTests: { ALL: true } }),
		authFlowTestSuite(),
		numberIdTestSuite(),
		joinsTestSuite(),
		uuidTestSuite(),
		caseInsensitiveTestSuite({
			disableTests: {
				"findOne - eq with mode sensitive (default) should not match different case": true,
			},
		}),
		compoundIndexTestSuite({
			async rerunMigrations(options) {
				const migrations = await getMigrations({
					...options,
					database: mysqlDB,
				});
				const pendingMigration = await migrations.compileMigrations();
				await migrations.runMigrations();
				return pendingMigration;
			},
			mismatchError:
				'Database index "compound_identity_uidx" on table "compound_index_subject" does not match the configured fields and uniqueness.',
			async verifyMismatchedIndexRejected(options) {
				await mysqlDB.query(
					"ALTER TABLE `compound_index_subject` DROP INDEX `compound_identity_uidx`",
				);
				await mysqlDB.query(
					"CREATE INDEX `compound_identity_uidx` ON `compound_index_subject` (`provider_subject`)",
				);
				try {
					await getMigrations({ ...options, database: mysqlDB });
				} finally {
					await mysqlDB.query(
						"ALTER TABLE `compound_index_subject` DROP INDEX `compound_identity_uidx`",
					);
					await mysqlDB.query(
						"CREATE UNIQUE INDEX `compound_identity_uidx` ON `compound_index_subject` (`issuer_url`, `provider_subject`)",
					);
				}
			},
		}),
	],
	async onFinish() {
		await mysqlDB.end();
	},
});
execute();
