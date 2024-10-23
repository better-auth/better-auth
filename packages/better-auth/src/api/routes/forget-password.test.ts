import { describe, expect, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";

describe("forget password", async (it) => {
	const mockSendEmail = vi.fn();
	let token = "";
	const { client, testUser } = await getTestInstance({
		emailAndPassword: {
			enabled: true,
			async sendResetPassword(user, url) {
				token = url.split("?")[0].split("/").pop() || "";
				await mockSendEmail();
			},
		},
	});
	it("should send a reset password email when enabled", async () => {
		await client.forgetPassword({
			email: testUser.email,
			redirectTo: "http://localhost:3000",
		});
		expect(token.length).toBeGreaterThan(10);
	});

	it("should verify the token", async () => {
		const newPassword = "new-password";
		const res = await client.resetPassword(
			{
				newPassword,
			},
			{
				query: {
					token,
				},
			},
		);

		expect(res.data).toMatchObject({
			status: true,
		});
	});

	it("should sign-in with the new password", async () => {
		const withOldCred = await client.signIn.email({
			email: testUser.email,
			password: testUser.email,
		});
		expect(withOldCred.error?.status).toBe(401);
		const newCred = await client.signIn.email({
			email: testUser.email,
			password: "new-password",
		});
		expect(newCred.data?.session).toBeDefined();
	});

	it("shouldn't allow the token to be used twice", async () => {
		const newPassword = "new-password";
		const res = await client.resetPassword(
			{
				newPassword,
			},
			{
				query: {
					token,
				},
			},
		);

		expect(res.error?.status).toBe(400);
	});
});
