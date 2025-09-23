import { getAuthTables } from "../../db";
import { testAdapter } from "../test-adapter";
import { memoryAdapter } from "./memory-adapter";
import {
	performanceTestSuite,
	normalTestSuite,
	transactionsTestSuite,
	authFlowTestSuite,
} from "../tests";

let db: Record<string, any[]> = {};

const { execute } = testAdapter({
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
		normalTestSuite({
			showDB: () => console.log(db),
		}),
		transactionsTestSuite(),
		authFlowTestSuite({}),
		performanceTestSuite({}),
	],
});

// biome-ignore lint/nursery/noFloatingPromises: awaiting this will block vitest from starting
execute();
