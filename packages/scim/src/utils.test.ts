import { describe, expect, it } from "vitest";
import { createScopedKey } from "./utils";

describe("SCIM persisted keys", () => {
	it("remain fixed-size for provider-controlled identifiers", () => {
		const key = createScopedKey([
			"scim-user-external-id",
			"connection-a",
			"external-id".repeat(1_000),
		]);

		expect(key).toHaveLength(43);
	});

	it("preserve tuple boundaries and connection scope", () => {
		expect(createScopedKey(["ab", "c"])).not.toBe(createScopedKey(["a", "bc"]));
		expect(createScopedKey(["connection-a", "resource"])).not.toBe(
			createScopedKey(["connection-b", "resource"]),
		);
	});
});
