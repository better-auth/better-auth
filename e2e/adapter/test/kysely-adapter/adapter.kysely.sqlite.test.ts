import fs from "node:fs/promises";
import path from "node:path";
import { kyselyAdapter } from "@better-auth/kysely-adapter";
import { testAdapter } from "@better-auth/test-utils/adapter";
import { getMigrations } from "better-auth/db/migration";
import Database from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";
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

const dbPath = path.join(__dirname, "test.db");
let database = new Database(dbPath);

let kyselyDB = new Kysely({
	dialect: new SqliteDialect({ database }),
});

const { execute } = await testAdapter({
	adapter: () => {
		return kyselyAdapter(kyselyDB, {
			type: "sqlite",
			debugLogs: { isRunningAdapterTests: true },
		});
	},
	prefixTests: "sqlite",
	async runMigrations(betterAuthOptions) {
		database.close();
		try {
			await fs.unlink(dbPath);
		} catch {
			console.log("db doesn't exist");
		}
		database = new Database(dbPath);
		kyselyDB = new Kysely({ dialect: new SqliteDialect({ database }) });
		const opts = Object.assign(betterAuthOptions, { database });
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
		compoundIndexTestSuite({
			async rerunMigrations(options) {
				const migrations = await getMigrations({ ...options, database });
				const pendingMigration = await migrations.compileMigrations();
				await migrations.runMigrations();
				return pendingMigration;
			},
			mismatchError:
				'Database index "compound_identity_uidx" on table "compound_index_subject" does not match the configured fields and uniqueness.',
			async verifyMismatchedIndexRejected(options) {
				database.exec(`
					DROP INDEX "compound_identity_uidx";
					CREATE INDEX "compound_identity_uidx"
						ON "compound_index_subject" ("provider_subject");
				`);
				try {
					await getMigrations({ ...options, database });
				} finally {
					database.exec(`
						DROP INDEX IF EXISTS "compound_identity_uidx";
						CREATE UNIQUE INDEX "compound_identity_uidx"
							ON "compound_index_subject" ("issuer_url", "provider_subject");
					`);
				}
			},
		}),
	],
	async onFinish() {
		database.close();
	},
});
execute();
