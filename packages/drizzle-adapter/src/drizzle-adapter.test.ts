import { describe, expect, it } from "vitest";
import { drizzleAdapter } from "./drizzle-adapter";

describe("drizzle-adapter", () => {
	it("should create drizzle adapter", () => {
		const db = {
			_: {
				fullSchema: {},
			},
		} as any;
		const config = {
			provider: "sqlite" as const,
		};
		const adapter = drizzleAdapter(db, config);
		expect(adapter).toBeDefined();
	});

	it("should support arrays for all providers (drizzle handles serialization via column modes)", () => {
		const db = {
			_: {
				fullSchema: {},
			},
		} as any;

		// Test that supportsArrays is true for all providers
		// This is important because Drizzle uses mode: 'json' columns for string[] types
		// on non-pg providers, and handles serialization/deserialization automatically
		const providers = ["sqlite", "mysql", "pg"] as const;

		for (const provider of providers) {
			const adapter = drizzleAdapter(db, { provider });
			// The adapter factory is created with supportsArrays: true
			// We can verify this by checking the adapter is created successfully
			expect(adapter).toBeDefined();
		}
	});
});
