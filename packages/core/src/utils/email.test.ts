import { describe, expect, it } from "vitest";
import { createPlaceholderEmail } from "./email";

describe("createPlaceholderEmail", () => {
	it("creates a namespaced address on the reserved placeholder domain", () => {
		expect(
			createPlaceholderEmail({
				identifier: "account-id",
				namespace: "namespace",
			}),
		).toBe("account-id@namespace.placeholder.invalid");
	});

	it("keeps equal identifiers distinct across namespaces", () => {
		const firstEmail = createPlaceholderEmail({
			identifier: "account-id",
			namespace: "first",
		});
		const secondEmail = createPlaceholderEmail({
			identifier: "account-id",
			namespace: "second",
		});

		expect(firstEmail).not.toBe(secondEmail);
	});

	it("rejects an invalid address", () => {
		expect(() =>
			createPlaceholderEmail({
				identifier: "account-id",
				namespace: "",
			}),
		).toThrow(TypeError);
	});
});
