import { describe } from "vitest";
import { memoryAdapter } from "./memory-adapter";
import { runAdapterTest } from "../test";
import type { BetterAuthOptions } from "../../types";

describe("adapter test", async () => {
	const db = {
		user: [],
		session: [],
		account: [],
	};
	const adapter = memoryAdapter(db);
	await runAdapterTest({
		adapter: adapter({
			user: {
				fields: {
					email: "email_address",
				},
			},
		} as BetterAuthOptions),
	});
});
