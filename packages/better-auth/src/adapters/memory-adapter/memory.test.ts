import { describe } from "vitest";
import { memoryAdapter } from "./memory-adapter";
import { runAdapterTest } from "../test";

describe("adapter test", async () => {
	const db = {
		user: [],
		session: [],
		account: [],
	};
	const adapter = memoryAdapter(db);
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
