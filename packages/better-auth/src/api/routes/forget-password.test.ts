import { describe, expect, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";

describe("forget password", async (it) => {
	const mockSendEmail = vi.fn();
	let token = "";

	const { client, testUser } = await getTestInstance(
		{
			emailAndPassword: {
				enabled: true,
				async sendResetPassword({ url }) {
					token = url.split("?")[0].split("/").pop() || "";
					await mockSendEmail();
				},
			},
		},
		{
			testWith: "sqlite",
		},
	);
	it("should send a reset password email when enabled", async () => {
		await client.forgetPassword({
			email: testUser.email,
			redirectTo: "http://localhost:3000",
		});
		expect(token.length).toBeGreaterThan(10);
	});

	it("should fail on invalid password", async () => {
		const res = await client.resetPassword(
			{
				newPassword: "short",
			},
			{
				query: {
					token,
				},
			},
		);
		expect(res.error?.status).toBe(400);
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
		expect(newCred.data?.user).toBeDefined();
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

	it("should expire", async () => {
		const { client, signInWithTestUser, testUser } = await getTestInstance({
			emailAndPassword: {
				enabled: true,
				async sendResetPassword({ token: _token }) {
					token = _token;
					await mockSendEmail();
				},
				resetPasswordTokenExpiresIn: 10,
			},
		});
		const { headers } = await signInWithTestUser();
		await client.forgetPassword({
			email: testUser.email,
			redirectTo: "/sign-in",
			fetchOptions: {
				headers,
			},
		});
		vi.useFakeTimers();
		await vi.advanceTimersByTimeAsync(1000 * 9);
		const callbackRes = await client.$fetch("/reset-password/:token", {
			params: {
				token,
			},
			query: {
				callbackURL: "/cb",
			},
			onError(context) {
				const location = context.response.headers.get("location");
				expect(location).not.toContain("error");
				expect(location).toContain("token");
			},
		});
		const res = await client.resetPassword({
			newPassword: "new-password",
			token,
		});
		expect(res.data?.status).toBe(true);
		await client.forgetPassword({
			email: testUser.email,
			redirectTo: "/sign-in",
			fetchOptions: {
				headers,
			},
		});
		vi.useFakeTimers();
		await vi.advanceTimersByTimeAsync(1000 * 11);
		const res2 = await client.resetPassword({
			newPassword: "new-password",
			token,
		});
		expect(res2.error?.status).toBe(400);
	});
});

describe("revoke sessions on password reset", async (it) => {
	const mockSendEmail = vi.fn();
	let token = "";

	const { client, testUser, signInWithTestUser } = await getTestInstance(
		{
			emailAndPassword: {
				enabled: true,
				async sendResetPassword({ url }) {
					token = url.split("?")[0].split("/").pop() || "";
					await mockSendEmail();
				},
				revokeSessionsOnPasswordReset: true,
			},
		},
		{
			testWith: "sqlite",
		},
	);

	it("should revoke other sessions when revokeSessionsOnPasswordReset is enabled", async () => {
		const { headers } = await signInWithTestUser();

		await client.forgetPassword({
			email: testUser.email,
			redirectTo: "http://localhost:3000",
		});

		await client.resetPassword(
			{
				newPassword: "new-password",
			},
			{
				query: {
					token,
				},
			},
		);

		const sessionAttempt = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(sessionAttempt.data).toBeNull();
	});

	it("should not revoke other sessions by default", async () => {
		const { client, testUser, signInWithTestUser } = await getTestInstance(
			{
				emailAndPassword: {
					enabled: true,
					async sendResetPassword({ url }) {
						token = url.split("?")[0].split("/").pop() || "";
						await mockSendEmail();
					},
				},
			},
			{
				testWith: "sqlite",
			},
		);

		const { headers } = await signInWithTestUser();

		await client.forgetPassword({
			email: testUser.email,
			redirectTo: "http://localhost:3000",
		});

		await client.resetPassword(
			{
				newPassword: "new-password",
			},
			{
				query: {
					token,
				},
			},
		);

		const sessionAttempt = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(sessionAttempt.data?.user).toBeDefined();
	});
});
