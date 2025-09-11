import { describe, beforeAll } from "vitest";
import { memoryAdapter, type MemoryDB } from "../../memory-adapter";
import { runJoinAdapterTest } from "../../../join-test";
import type { BetterAuthOptions } from "../../../../types";

describe("Memory Adapter JOIN Tests", async () => {
	let memoryDB: MemoryDB;

	const testOptions = (): BetterAuthOptions =>
		({
			user: {
				fields: {
					email: "email",
				},
			},
			session: {
				fields: {
					token: "token",
				},
			},
			plugins: [],
		}) satisfies BetterAuthOptions;

	beforeAll(async () => {
		// Initialize memory database with required tables
		memoryDB = {
			user: [],
			session: [],
		};
	});

	await runJoinAdapterTest({
		testPrefix: "Memory JOIN",
		getAdapter: async (customOptions = {}) => {
			const options = { ...testOptions(), ...customOptions };
			const adapter = memoryAdapter(memoryDB);
			return adapter(options);
		},
		tableNames: {
			user: "user",
			session: "session",
		},
		fieldMappings: {
			userEmail: "email",
			sessionToken: "token",
		},
	});
});
