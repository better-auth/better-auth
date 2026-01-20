import { DatabaseSync } from "node:sqlite";
import { kyselyAdapter } from "@better-auth/kysely-adapter";
import { NodeSqliteDialect } from "@better-auth/kysely-adapter/node-sqlite-dialect";
import { testAdapter } from "@better-auth/test-utils/adapter";
import { getMigrations } from "better-auth/db/migration";
import { Kysely } from "kysely";
import {
	authFlowTestSuite,
	joinsTestSuite,
	normalTestSuite,
	numberIdTestSuite,
	transactionsTestSuite,
	uuidTestSuite,
} from "../tests";

let db = new DatabaseSync(":memory:");
let betterAuthKysely = new Kysely({
	dialect: new NodeSqliteDialect({
		database: db,
	}),
});

const { execute } = await testAdapter({
	adapter: () => {
		return kyselyAdapter(betterAuthKysely, {
			type: "sqlite",
			debugLogs: { isRunningAdapterTests: true },
		});
	},
	prefixTests: "node-sqlite",
	async runMigrations(betterAuthOptions) {
		await betterAuthKysely.destroy();
		db = new DatabaseSync(":memory:");
		betterAuthKysely = new Kysely({
			dialect: new NodeSqliteDialect({
				database: db,
			}),
		});
		const opts = Object.assign(betterAuthOptions, { database: db });
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
	],
	async onFinish() {
		await betterAuthKysely.destroy();
	},
});

execute();
