import { Kysely, SqliteDialect } from "kysely";
import { testAdapter } from "../../test-adapter";
import { kyselyAdapter } from "../kysely-adapter";
import Database from "better-sqlite3";
import {
	authFlowTestSuite,
	normalTestSuite,
	numberIdTestSuite,
	performanceTestSuite,
	transactionsTestSuite,
} from "../../tests";
import path from "path";
import { getMigrations } from "../../../db";
import fs from "fs/promises";

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
			console.log("db doesnt exist");
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
		numberIdTestSuite(),
		performanceTestSuite({ dialect: "sqlite" }),
	],
	async onFinish() {
		database.close();
	},
});
execute();
