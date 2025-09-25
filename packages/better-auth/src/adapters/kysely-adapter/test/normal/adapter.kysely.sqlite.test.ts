import { Kysely, SqliteDialect } from "kysely";
import { testAdapter } from "../../../test-adapter";
import { kyselyAdapter } from "../../kysely-adapter";
import Database from "better-sqlite3";
import {
	authFlowTestSuite,
	normalTestSuite,
	performanceTestSuite,
	transactionsTestSuite,
} from "../../../tests";
import path from "path";
import { getMigrations } from "../../../../db";
import fs from "fs/promises";
import { waitForTestPermission } from "../../../../test/adapter-test-setup";

const { done } = await waitForTestPermission("kysely-sqlite");

const dbPath = path.join(__dirname, "test.db");
let database = new Database(dbPath);

let kyselyDB = new Kysely({
	dialect: new SqliteDialect({ database }),
});

const { execute } = testAdapter({
	adapter: () => kyselyAdapter(kyselyDB, { type: "sqlite" }),
	prefixTests: "sqlite",
	async runMigrations(betterAuthOptions) {
		database.close();
		if (await fs.lstat(dbPath)) {
			await fs.unlink(dbPath);
		}
		database = new Database(dbPath);
		kyselyDB = new Kysely({ dialect: new SqliteDialect({ database }) });
		const opts = Object.assign(betterAuthOptions, { database });
		const { runMigrations } = await getMigrations(opts);
		await runMigrations();
	},
	tests: [
		normalTestSuite(),
		transactionsTestSuite({ disableTests: { ALL: true } }),
		authFlowTestSuite(),
		performanceTestSuite({ dialect: "sqlite" }),
	],
	async onFinish() {
		database.close();
		await done();
	},
});

execute();
