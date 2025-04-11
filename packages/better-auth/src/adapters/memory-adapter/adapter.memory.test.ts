import { describe } from "vitest";
import { memoryAdapter } from "./memory-adapter";
import { runAdapterTest, runNumberIdAdapterTest } from "../test";

describe("adapter test", async () => {
	const db = {
		user: [],
		session: [],
		account: [],
	};
	const adapter = memoryAdapter(db, {
		debugLogs: {
			isRunningAdapterTests: true,
		},
	});
	await runAdapterTest({
		getAdapter: async (customOptions = {}) => {
			return adapter({
				user: {
					fields: {
						email: "email_address",
					},
				},
				...customOptions,
			});
		},
	});
});

describe("Number Id Adapter Test", async () => {
	const db = {
		user: [],
		session: [],
		account: [],
	};
	const adapter = memoryAdapter(db, {
		debugLogs: {
			isRunningAdapterTests: true,
		},
	});
	await runNumberIdAdapterTest({
		getAdapter: async (customOptions = {}) => {
			return adapter({
				...customOptions,
			});
		},
	});
});
