import { describe, expect, it, vi } from "vitest";
import { getTestInstance } from "./test-instance";

describe("getTestInstance password hasher", () => {
	it("should normalize passwords with NFKC", async () => {
		const email = "unicode-password@test.com";
		const password = "비밀번호１２３４５６";
		const { auth } = await getTestInstance(undefined, {
			disableTestUser: true,
		});

		await auth.api.signUpEmail({
			body: {
				email,
				name: "Unicode Password",
				password,
			},
		});

		const result = await auth.api.signInEmail({
			body: {
				email,
				password: password.normalize("NFKC"),
			},
		});

		expect(result.user.email).toBe(email);
	});

	it("should preserve a caller-provided password implementation", async () => {
		const email = "custom-password@test.com";
		const password = "test123456";
		const hash = vi.fn(async (value: string) => `custom:${value}`);
		const verify = vi.fn(
			async ({ hash, password }: { hash: string; password: string }) =>
				hash === `custom:${password}`,
		);
		const { auth } = await getTestInstance(
			{
				emailAndPassword: {
					enabled: true,
					password: { hash, verify },
				},
			},
			{ disableTestUser: true },
		);

		await auth.api.signUpEmail({
			body: {
				email,
				name: "Custom Password",
				password,
			},
		});

		expect(hash).toHaveBeenCalledWith(password);

		await auth.api.signInEmail({
			body: { email, password },
		});

		expect(verify).toHaveBeenCalledWith({
			hash: `custom:${password}`,
			password,
		});
	});
});
