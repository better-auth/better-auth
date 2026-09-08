import { describe, expect, it } from "vitest";
import { createSCIMUserExternalIdKey, createScopedKey } from "./resource-key";

describe("SCIM persisted keys", () => {
	it("remain fixed-size for provider-controlled identifiers", () => {
		const key = createSCIMUserExternalIdKey(
			"connection-a",
			"external-id".repeat(1_000),
		);

		expect(key).toHaveLength(43);
	});

	it("scope User externalIds by exact connection and value", () => {
		expect(createSCIMUserExternalIdKey("connection-a", "external-id")).toBe(
			createSCIMUserExternalIdKey("connection-a", "external-id"),
		);
		expect(createSCIMUserExternalIdKey("connection-a", "external-id")).not.toBe(
			createSCIMUserExternalIdKey("connection-b", "external-id"),
		);
		expect(createSCIMUserExternalIdKey("connection-a", "external-id")).not.toBe(
			createSCIMUserExternalIdKey("connection-a", "EXTERNAL-ID"),
		);
	});

	it("preserve tuple boundaries and connection scope", () => {
		expect(createScopedKey(["ab", "c"])).not.toBe(createScopedKey(["a", "bc"]));
		expect(createScopedKey(["connection-a", "resource"])).not.toBe(
			createScopedKey(["connection-b", "resource"]),
		);
	});
});
