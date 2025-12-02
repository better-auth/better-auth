import { describe, expect, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import type { Account } from "../../types";

describe("forget password", async (it) => {
	const mockSendEmail = vi.fn();
	const mockOnPasswordReset = vi.fn();
	let token = "";

	const { client, testUser, db } = await getTestInstance(
		{
			emailAndPassword: {
				enabled: true,
				async sendResetPassword({ url }) {
					token = url.split("?")[0]!.split("/").pop() || "";
					await mockSendEmail();
				},
				onPasswordReset: async ({ user }) => {
					await mockOnPasswordReset(user);
				},
			},
		},
		{
			testWith: "sqlite",
		},
	);
	it("should send a reset password email when enabled", async () => {
		await client.requestPasswordReset({
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

	it("should update account's updatedAt when resetting password", async () => {
		// Create a new user to test with
		const newHeaders = new Headers();
		const signUpRes = await client.signUp.email({
			name: "Test Reset User",
			email: "test-reset-updated@email.com",
			password: "originalPassword123",
			fetchOptions: {
				onSuccess(ctx) {
					const setCookie = ctx.response.headers.get("set-cookie");
					if (setCookie) {
						newHeaders.set("cookie", setCookie);
					}
				},
			},
		});

		const userId = signUpRes.data?.user.id;
		expect(userId).toBeDefined();

		// Get initial account data
		const initialAccounts: Account[] = await db.findMany({
			model: "account",
			where: [
				{
					field: "userId",
					value: userId!,
				},
				{
					field: "providerId",
					value: "credential",
				},
			],
		});
		expect(initialAccounts.length).toBe(1);
		const initialUpdatedAt = initialAccounts[0]!.updatedAt;

		// Request password reset
		let resetToken = "";
		await client.requestPasswordReset({
			email: "test-reset-updated@email.com",
			redirectTo: "http://localhost:3000",
		});

		// Extract token from mock send email
		expect(token).toBeDefined();
		resetToken = token;

		// Wait a bit to ensure time difference
		await new Promise((resolve) => setTimeout(resolve, 100));

		// Reset password
		const resetRes = await client.resetPassword({
			newPassword: "newResetPassword123",
			token: resetToken,
		});
		expect(resetRes.data?.status).toBe(true);

		// Get updated account data
		const updatedAccounts: Account[] = await db.findMany({
			model: "account",
			where: [
				{
					field: "userId",
					value: userId!,
				},
				{
					field: "providerId",
					value: "credential",
				},
			],
		});
		expect(updatedAccounts.length).toBe(1);
		const newUpdatedAt = updatedAccounts[0]!.updatedAt;

		// Verify updatedAt was refreshed
		expect(newUpdatedAt).not.toBe(initialUpdatedAt);
		expect(new Date(newUpdatedAt).getTime()).toBeGreaterThan(
			new Date(initialUpdatedAt).getTime(),
		);

		// Verify user can sign in with new password
		const signInRes = await client.signIn.email({
			email: "test-reset-updated@email.com",
			password: "newResetPassword123",
		});
		expect(signInRes.data?.user).toBeDefined();
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
		const { runWithUser } = await signInWithTestUser();
		await runWithUser(async () => {
			await client.requestPasswordReset({
				email: testUser.email,
				redirectTo: "/sign-in",
			});
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
		await runWithUser(async () => {
			await client.requestPasswordReset({
				email: testUser.email,
				redirectTo: "/sign-in",
			});
		});
		vi.useFakeTimers();
		await vi.advanceTimersByTimeAsync(1000 * 11);
		const res2 = await client.resetPassword({
			newPassword: "new-password",
			token,
		});
		expect(mockOnPasswordReset).toHaveBeenCalled();
		expect(res2.error?.status).toBe(400);
	});

	it("should allow callbackURL to have multiple query params", async () => {
		let url = "";

		const { client, testUser } = await getTestInstance({
			emailAndPassword: {
				enabled: true,
				async sendResetPassword(context) {
					url = context.url;
					await mockSendEmail();
				},
				resetPasswordTokenExpiresIn: 10,
			},
		});

		const queryParams = "foo=bar&baz=qux";
		const redirectTo = `http://localhost:3000?${queryParams}`;
		const res = await client.requestPasswordReset({
			email: testUser.email,
			redirectTo,
		});

		expect(res.data?.status).toBe(true);
		expect(url).not.toContain(queryParams);
		expect(url).toContain(`callbackURL=${encodeURIComponent(redirectTo)}`);
	});

	it("should not reveal user existence on success", async () => {
		const { client, testUser } = await getTestInstance({
			emailAndPassword: {
				enabled: true,
				async sendResetPassword() {
					await mockSendEmail();
				},
			},
		});
		const res = await client.requestPasswordReset({
			email: testUser.email,
			redirectTo: "http://localhost:3000",
		});
		expect(res.data?.message).toBe(
			"If this email exists in our system, check your email for the reset link",
		);
	});

	it("should not reveal user existence on failure", async () => {
		const { client } = await getTestInstance({
			emailAndPassword: {
				enabled: true,
				async sendResetPassword() {
					await mockSendEmail();
				},
			},
		});
		const res = await client.requestPasswordReset({
			email: "non-existent-user@email.com",
			redirectTo: "http://localhost:3000",
		});
		expect(res.data?.message).toBe(
			"If this email exists in our system, check your email for the reset link",
		);
	});

	it("should not reveal failure of email sending", async () => {
		const { client, testUser } = await getTestInstance({
			emailAndPassword: {
				enabled: true,
				async sendResetPassword() {
					throw new Error("Failed to send email");
				},
			},
		});
		const res = await client.requestPasswordReset({
			email: testUser.email,
			redirectTo: "http://localhost:3000",
		});
		expect(res.data?.status).toBe(true);
		expect(res.data?.message).toBe(
			"If this email exists in our system, check your email for the reset link",
		);
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
					token = url.split("?")[0]!.split("/").pop() || "";
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
		const { runWithUser } = await signInWithTestUser();

		await client.requestPasswordReset({
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

		await runWithUser(async () => {
			const sessionAttempt = await client.getSession();
			expect(sessionAttempt.data).toBeNull();
		});
	});

	it("should not revoke other sessions by default", async () => {
		const { client, testUser, signInWithTestUser } = await getTestInstance(
			{
				emailAndPassword: {
					enabled: true,
					async sendResetPassword({ url }) {
						token = url.split("?")[0]!.split("/").pop() || "";
						await mockSendEmail();
					},
				},
			},
			{
				testWith: "sqlite",
			},
		);

		const { runWithUser } = await signInWithTestUser();

		await client.requestPasswordReset({
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

		await runWithUser(async () => {
			const sessionAttempt = await client.getSession();
			expect(sessionAttempt.data?.user).toBeDefined();
		});
	});
});
