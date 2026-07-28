import { describe, expect, it } from "vitest";
import * as z from "zod";
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

	it("creates an address accepted by the email schema", () => {
		const email = createPlaceholderEmail({
			identifier: "account-id",
			namespace: "namespace",
		});

		expect(z.email().safeParse(email).success).toBe(true);
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
});
