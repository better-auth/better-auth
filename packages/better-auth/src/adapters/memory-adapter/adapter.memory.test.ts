import { getAuthTables } from "../../db";
import { testAdapter } from "../test-adapter";
import { memoryAdapter } from "./memory-adapter";
import {
	performanceTestSuite,
	normalTestSuite,
	transactionsTestSuite,
	authFlowTestSuite,
	numberIdTestSuite,
} from "../tests";
let db: Record<string, any[]> = {};

const { execute } = await testAdapter({
	adapter: () => {
		return memoryAdapter(db);
	},
	runMigrations: (options) => {
		db = {};
		const allModels = Object.keys(getAuthTables(options));
		for (const model of allModels) {
			db[model] = [];
		}
	},
	tests: [
		normalTestSuite(),
		transactionsTestSuite({ disableTests: { ALL: true } }),
		authFlowTestSuite(),
		numberIdTestSuite(),
		performanceTestSuite(),
	],
	async onFinish() {},
});

execute();
