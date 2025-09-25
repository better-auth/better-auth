import { getAuthTables } from "../../db";
import { testAdapter } from "../test-adapter";
import { memoryAdapter } from "./memory-adapter";
import {
	performanceTestSuite,
	normalTestSuite,
	transactionsTestSuite,
	authFlowTestSuite,
} from "../tests";
import { waitForTestPermission } from "../../test/adapter-test-setup";

let db: Record<string, any[]> = {};

const { done } = await waitForTestPermission("memory");

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
	async onFinish() {
		await done();
	},
});

execute();
