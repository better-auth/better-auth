import { APIError } from "better-call";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../../test-utils";
import type { Account, BetterAuthOptions } from "../../types";

describe("forgot password", async () => {
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
	afterEach(() => {
		vi.useRealTimers();
	});

	it("should send a reset password email when enabled", async () => {
		await client.requestPasswordReset({
			email: testUser.email,
			redirectTo: "http://localhost:3000",
		});
		expect(token.length).toBeGreaterThan(10);
	});

	it("should reject untrusted redirectTo", async () => {
		const { client, testUser } = await getTestInstance({
			emailAndPassword: {
				enabled: true,
				async sendResetPassword() {},
			},
			trustedOrigins: ["http://localhost:3000"],
			advanced: {
				disableOriginCheck: false,
			},
		});
		const res = await client.requestPasswordReset({
			email: testUser.email,
			redirectTo: "http://malicious.com",
		});

		expect(res.error?.status).toBe(403);
		expect(res.error?.message).toBe("Invalid redirectURL");
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
		expect(updatedAccounts[0]).toMatchObject({
			providerId: "credential",
			accountId: userId,
		});
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

	// A single reset token is single-use: two requests racing the same valid
	// token must yield exactly one password change. Otherwise a leaked token
	// could still be replayed during the window between validating and deleting
	// the verification row, letting an attacker overwrite the chosen password.
	it("should reject a concurrent reset using the same token", async () => {
		const email = "race-reset@email.com";
		await client.signUp.email({
			name: "Race Reset User",
			email,
			password: "originalPassword123",
		});

		await client.requestPasswordReset({
			email,
			redirectTo: "http://localhost:3000",
		});
		const raceToken = token;

		const attackerPassword = "attacker-password-123";
		const legitimatePassword = "legitimate-password-123";
		const [first, second] = await Promise.all([
			client.resetPassword(
				{ newPassword: legitimatePassword },
				{ query: { token: raceToken } },
			),
			client.resetPassword(
				{ newPassword: attackerPassword },
				{ query: { token: raceToken } },
			),
		]);

		const results = [first, second];
		const succeeded = results.filter((res) => res.data?.status === true);
		const rejected = results.filter((res) => res.error?.status === 400);
		expect(succeeded).toHaveLength(1);
		expect(rejected).toHaveLength(1);

		const winningPassword =
			first.data?.status === true ? legitimatePassword : attackerPassword;
		const losingPassword =
			first.data?.status === true ? attackerPassword : legitimatePassword;

		const winSignIn = await client.signIn.email({
			email,
			password: winningPassword,
		});
		expect(winSignIn.data?.user).toBeDefined();

		const loseSignIn = await client.signIn.email({
			email,
			password: losingPassword,
		});
		expect(loseSignIn.error?.status).toBe(401);
	});

	it("should expire", async () => {
		const onPasswordReset = vi.fn();
		const { client, signInWithTestUser, testUser } = await getTestInstance({
			emailAndPassword: {
				enabled: true,
				async sendResetPassword({ token: _token }) {
					token = _token;
					await mockSendEmail();
				},
				resetPasswordTokenExpiresIn: 10,
				onPasswordReset,
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
		await client.$fetch("/reset-password/:token", {
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
		expect(onPasswordReset).toHaveBeenCalledOnce();
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
		expect(onPasswordReset).toHaveBeenCalledOnce();
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

describe("revoke sessions on password reset", async () => {
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

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11597
	 */
	describe("when a step of the reset fails", () => {
		async function setup(
			onPasswordReset?: () => Promise<void>,
			options?: Pick<BetterAuthOptions, "secondaryStorage" | "session">,
		) {
			let resetToken = "";
			const instance = await getTestInstance({
				...options,
				emailAndPassword: {
					enabled: true,
					async sendResetPassword({ url }) {
						resetToken = url.split("?")[0]!.split("/").pop() || "";
					},
					revokeSessionsOnPasswordReset: true,
					onPasswordReset,
				},
			});
			const { headers } = await instance.signInWithTestUser();
			const resetPassword = async (newPassword: string) => {
				await instance.client.requestPasswordReset({
					email: instance.testUser.email,
					redirectTo: "http://localhost:3000",
				});
				return retryReset(newPassword);
			};
			const retryReset = (newPassword: string) =>
				instance.client.resetPassword(
					{ newPassword },
					{ query: { token: resetToken } },
				);
			const signInWith = (password: string) =>
				instance.client.signIn.email({
					email: instance.testUser.email,
					password,
				});
			const getExistingSession = () =>
				instance.auth.api.getSession({ headers });
			return {
				...instance,
				resetPassword,
				retryReset,
				signInWith,
				getExistingSession,
			};
		}

		it("keeps the old password and sessions when session revocation fails", async () => {
			const { auth, testUser, resetPassword, signInWith, getExistingSession } =
				await setup();
			const ctx = await auth.$context;
			vi.spyOn(ctx.internalAdapter, "deleteUserSessions").mockRejectedValue(
				new Error("session store unavailable"),
			);

			const reset = await resetPassword("new-password");

			expect(reset.error?.status).toBe(500);
			expect((await signInWith("new-password")).error?.status).toBe(401);
			expect((await signInWith(testUser.password)).data).not.toBeNull();
			expect(await getExistingSession()).not.toBeNull();
		});

		it("leaves the reset token usable when session revocation fails", async () => {
			const { auth, resetPassword, retryReset, signInWith } = await setup();
			const ctx = await auth.$context;
			vi.spyOn(ctx.internalAdapter, "deleteUserSessions").mockRejectedValueOnce(
				new Error("session store unavailable"),
			);

			expect((await resetPassword("new-password")).error?.status).toBe(500);
			expect((await retryReset("new-password")).data?.status).toBe(true);
			expect((await signInWith("new-password")).data).not.toBeNull();
		});

		/**
		 * @see https://github.com/better-auth/better-auth/issues/10632
		 */
		it("leaves the reset token usable when the new password is rejected", async () => {
			const { auth, resetPassword, retryReset, signInWith } = await setup();
			const ctx = await auth.$context;
			vi.spyOn(ctx.password, "hash").mockRejectedValueOnce(
				new APIError("BAD_REQUEST", {
					message: "Password is compromised",
					code: "PASSWORD_COMPROMISED",
				}),
			);

			expect((await resetPassword("pwned-password")).error?.status).toBe(400);
			expect((await retryReset("safe-password")).data?.status).toBe(true);
			expect((await signInWith("safe-password")).data).not.toBeNull();
		});

		it("keeps existing sessions when the password write fails", async () => {
			const { auth, testUser, resetPassword, signInWith, getExistingSession } =
				await setup();
			const ctx = await auth.$context;
			vi.spyOn(ctx.internalAdapter, "updatePassword").mockRejectedValue(
				new Error("database unavailable"),
			);

			const reset = await resetPassword("new-password");

			expect(reset.error?.status).toBe(500);
			expect(await getExistingSession()).not.toBeNull();
			expect((await signInWith(testUser.password)).data).not.toBeNull();
		});

		it("still revokes sessions when onPasswordReset throws", async () => {
			const { resetPassword, signInWith, getExistingSession } = await setup(
				async () => {
					throw new Error("hook failed");
				},
			);

			const reset = await resetPassword("new-password");

			expect(reset.error?.status).toBe(500);
			expect(await getExistingSession()).toBeNull();
			expect((await signInWith("new-password")).data).not.toBeNull();
		});

		/**
		 * @see https://github.com/better-auth/better-auth/issues/11639
		 */
		it("removes cached sessions when the password write fails without a transaction", async () => {
			const store = new Map<string, string>();
			const { auth, testUser, resetPassword, signInWith, getExistingSession } =
				await setup(undefined, {
					secondaryStorage: {
						set(key, value) {
							store.set(key, value);
						},
						get(key) {
							return store.get(key) || null;
						},
						getAndDelete(key) {
							const value = store.get(key) || null;
							store.delete(key);
							return value;
						},
						increment(key) {
							const count = Number(store.get(key) ?? 0) + 1;
							store.set(key, String(count));
							return count;
						},
						delete(key) {
							store.delete(key);
						},
					},
					session: { storeSessionInDatabase: true },
				});
			const ctx = await auth.$context;
			// Behave like an adapter configured with `transaction: false`.
			ctx.adapter.transaction = (cb) => cb(ctx.adapter);
			const adapterConfig = ctx.adapter.options!.adapterConfig as {
				transaction: unknown;
			};
			adapterConfig.transaction = false;
			vi.spyOn(ctx.internalAdapter, "updatePassword").mockRejectedValue(
				new Error("database unavailable"),
			);

			const reset = await resetPassword("new-password");

			expect(reset.error?.status).toBe(500);
			expect(await getExistingSession()).toBeNull();
			expect((await signInWith(testUser.password)).data).not.toBeNull();
		});
	});
});

describe("verify password", async () => {
	const { testUser, auth } = await getTestInstance({
		emailAndPassword: {
			enabled: true,
		},
	});

	const getSessionHeaders = async () => {
		const signInRes = await auth.api.signInEmail({
			body: {
				email: testUser.email,
				password: testUser.password,
			},
			returnHeaders: true,
		});

		const headers = new Headers();
		headers.set("cookie", signInRes.headers.getSetCookie()[0]!);
		return headers;
	};

	it("should verify password with correct password", async () => {
		const headers = await getSessionHeaders();

		const verifyRes = await auth.api.verifyPassword({
			body: {
				password: testUser.password,
			},
			headers,
		});

		expect(verifyRes).toMatchObject({
			status: true,
		});
	});

	it("should fail to verify password with incorrect password", async () => {
		const headers = await getSessionHeaders();

		try {
			await auth.api.verifyPassword({
				body: {
					password: "wrong-password",
				},
				headers,
			});
			expect.fail("Should have thrown an error");
		} catch (error) {
			expect(error).toBeInstanceOf(APIError);
			if (error instanceof APIError) {
				expect(error.status).toBe("BAD_REQUEST");
				expect(error.message).toBe("Invalid password");
			}
		}
	});

	it("should require a session to verify password", async () => {
		try {
			await auth.api.verifyPassword({
				body: {
					password: testUser.password,
				},
				headers: new Headers(),
			});
			expect.fail("Should have thrown an error");
		} catch (error) {
			expect(error).toBeInstanceOf(APIError);
			if (error instanceof APIError) {
				expect(error.status).toBe("UNAUTHORIZED");
			}
		}
	});
});

/**
 * @see https://github.com/better-auth/better-auth/issues/11323
 */
describe("verify password length", async () => {
	const hash = vi.fn(async (password: string) => `hashed:${password}`);
	const verify = vi.fn(
		async ({ hash, password }: { hash: string; password: string }) =>
			hash === `hashed:${password}`,
	);
	const { auth, signInWithTestUser } = await getTestInstance({
		emailAndPassword: {
			enabled: true,
			password: { hash, verify },
		},
	});

	it("should reject a password longer than maxPasswordLength before hashing", async () => {
		const { headers } = await signInWithTestUser();
		hash.mockClear();
		verify.mockClear();

		await expect(
			auth.api.verifyPassword({
				body: {
					password: "x".repeat(129),
				},
				headers,
			}),
		).rejects.toMatchObject({
			status: "BAD_REQUEST",
			body: { code: "PASSWORD_TOO_LONG" },
		});

		expect(hash).not.toHaveBeenCalled();
		expect(verify).not.toHaveBeenCalled();
	});
});
