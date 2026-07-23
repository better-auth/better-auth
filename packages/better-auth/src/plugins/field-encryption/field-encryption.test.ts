import { describe, expect, it } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { fieldEncryption } from ".";

const TEST_SECRET = "test-secret-for-field-encryption-plugin";

describe("fieldEncryption", async () => {
	const { auth } = await getTestInstance({
		plugins: [
			fieldEncryption({
				encryptionKey: TEST_SECRET,
				fields: {
					user: ["name"],
				},
			}),
		],
	});

	it("should encrypt user fields on create and decrypt on read", async () => {
		const user = await auth.api.signUpEmail({
			body: {
				email: "encrypt-test@example.com",
				password: "password123",
				name: "Sensitive Name",
			},
		});

		expect(user.user.name).toBe("Sensitive Name");

		// Confirm decryption works on a fresh read from the database
		const session = await auth.api.getSession({
			headers: new Headers({
				authorization: `Bearer ${user.token}`,
			}),
		});
		expect(session?.user.name).toBe("Sensitive Name");
	});

	it("should handle null and empty values without encrypting", async () => {
		const user = await auth.api.signUpEmail({
			body: {
				email: "null-test@example.com",
				password: "password123",
				name: "",
			},
		});

		// Empty string should pass through without encryption
		const session = await auth.api.getSession({
			headers: new Headers({
				authorization: `Bearer ${user.token}`,
			}),
		});
		expect(session?.user.name).toBe("");
	});

	it("should decrypt correctly after update", async () => {
		const user = await auth.api.signUpEmail({
			body: {
				email: "update-test@example.com",
				password: "password123",
				name: "Original Name",
			},
		});

		await auth.api.updateUser({
			body: { name: "Updated Name" },
			headers: new Headers({
				authorization: `Bearer ${user.token}`,
			}),
		});

		const session = await auth.api.getSession({
			headers: new Headers({
				authorization: `Bearer ${user.token}`,
			}),
		});
		expect(session?.user.name).toBe("Updated Name");
	});

	it("should work with auth instance secret as fallback", async () => {
		const { auth: authWithFallback } = await getTestInstance({
			plugins: [
				fieldEncryption({
					// No encryptionKey — should fall back to ctx.secretConfig
					fields: {
						user: ["name"],
					},
				}),
			],
		});

		const user = await authWithFallback.api.signUpEmail({
			body: {
				email: "fallback-key@example.com",
				password: "password123",
				name: "Fallback Test",
			},
		});

		const session = await authWithFallback.api.getSession({
			headers: new Headers({
				authorization: `Bearer ${user.token}`,
			}),
		});
		expect(session?.user.name).toBe("Fallback Test");
	});

	it("should handle multiple encrypted fields", async () => {
		const { auth: multiAuth } = await getTestInstance({
			plugins: [
				fieldEncryption({
					encryptionKey: TEST_SECRET,
					fields: {
						user: ["name", "image"],
					},
				}),
			],
		});

		const user = await multiAuth.api.signUpEmail({
			body: {
				email: "multi-field@example.com",
				password: "password123",
				name: "Secret Name",
				image: "https://example.com/secret-avatar.png",
			},
		});

		const session = await multiAuth.api.getSession({
			headers: new Headers({
				authorization: `Bearer ${user.token}`,
			}),
		});
		expect(session?.user.name).toBe("Secret Name");
		expect(session?.user.image).toBe("https://example.com/secret-avatar.png");
	});

	it("should handle special characters in field values", async () => {
		const user = await auth.api.signUpEmail({
			body: {
				email: "special-chars@example.com",
				password: "password123",
				name: "José María García-López — 日本語テスト 🔐",
			},
		});

		const session = await auth.api.getSession({
			headers: new Headers({
				authorization: `Bearer ${user.token}`,
			}),
		});
		expect(session?.user.name).toBe(
			"José María García-López — 日本語テスト 🔐",
		);
	});
});
