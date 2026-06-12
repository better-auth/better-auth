import { memoryAdapter } from "@better-auth/memory-adapter";
import { testAdapter } from "@better-auth/test-utils/adapter";
import { getAuthTables } from "better-auth/db";
import {
	authFlowTestSuite,
	caseInsensitiveTestSuite,
	joinsTestSuite,
	normalTestSuite,
	numberIdTestSuite,
	transactionsTestSuite,
	uuidTestSuite,
} from "../adapter-factory";

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
		// The conformance wrapper re-resolves the adapter on every operation, so it
		// cannot observe an in-memory transaction's isolation: rollback and commit
		// semantics for this adapter are covered directly in memory-adapter.test.ts.
		transactionsTestSuite({ disableTests: { ALL: true } }),
		authFlowTestSuite(),
		numberIdTestSuite(),
		joinsTestSuite(),
		uuidTestSuite(),
		caseInsensitiveTestSuite(),
	],
	async onFinish() {},
});

execute();
