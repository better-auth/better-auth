import { getAuthTables } from "../../db";
import { testAdapter } from "../test-adapter";
import {
	authFlowTestSuite,
	normalTestSuite,
	numberIdTestSuite,
	transactionsTestSuite,
} from "../tests";
import { memoryAdapter } from "./memory-adapter";

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
	],
	async onFinish() {},
});

execute();
