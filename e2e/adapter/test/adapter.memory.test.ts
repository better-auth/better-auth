import { memoryAdapter } from "@better-auth/memory-adapter";
import { testAdapter } from "@better-auth/test-utils/adapter";
import { getAuthTables } from "better-auth/db";
import {
	authFlowTestSuite,
	joinsTestSuite,
	normalTestSuite,
	numberIdTestSuite,
	transactionsTestSuite,
	uuidTestSuite,
} from "./tests";

let db: Record<string, any[]> = {};

const { execute } = await testAdapter({
	adapter: () => {
		return memoryAdapter(db);
	},
	runMigrations: (options) => {
		db = {};
		const authTables = getAuthTables(options);
		const allModels = Object.keys(authTables);
		for (const model of allModels) {
			const modelName = authTables[model]?.modelName || model;
			db[modelName] = [];
		}
	},
	tests: [
		normalTestSuite(),
		transactionsTestSuite({ disableTests: { ALL: true } }),
		authFlowTestSuite(),
		numberIdTestSuite(),
		joinsTestSuite(),
		uuidTestSuite(),
	],
	async onFinish() {},
});

execute();
