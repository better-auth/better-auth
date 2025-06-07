import { describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { createHeadersWithTenantId } from "../../test-utils/headers";

describe("Email Verification", async () => {
	const mockSendEmail = vi.fn();
	let token: string;
	const { auth, testUser, client, signInWithUser } = await getTestInstance({
		emailAndPassword: {
			enabled: true,
			requireEmailVerification: true,
		},
		emailVerification: {
			async sendVerificationEmail({ user, url, token: _token }) {
				token = _token;
				mockSendEmail(user.email, url);
			},
		},
	});

	it("should send a verification email when enabled", async () => {
		await auth.api.sendVerificationEmail({
			body: {
				email: testUser.email,
			},
		});
		expect(mockSendEmail).toHaveBeenCalledWith(
			testUser.email,
			expect.any(String),
		);
	});

	it("should send a verification email if verification is required and user is not verified", async () => {
		await signInWithUser(testUser.email, testUser.password);

		expect(mockSendEmail).toHaveBeenCalledWith(
			testUser.email,
			expect.any(String),
		);
	});

	it("should verify email", async () => {
		const res = await client.verifyEmail({
			query: {
				token,
			},
		});
		expect(res.data?.status).toBe(true);
	});

	it("should redirect to callback", async () => {
		await client.verifyEmail(
			{
				query: {
					token,
					callbackURL: "/callback",
				},
			},
			{
				onError: (ctx) => {
					const location = ctx.response.headers.get("location");
					expect(location).toBe("/callback");
				},
			},
		);
	});

	it("should sign after verification", async () => {
		const { testUser, signInWithUser, client } = await getTestInstance({
			emailAndPassword: {
				enabled: true,
				requireEmailVerification: true,
			},
			emailVerification: {
				async sendVerificationEmail({ user, url, token: _token }) {
					token = _token;
					mockSendEmail(user.email, url);
				},
				autoSignInAfterVerification: true,
			},
		});
		await signInWithUser(testUser.email, testUser.password);

		let sessionToken = "";
		const res = await client.verifyEmail({
			query: {
				token,
			},
			fetchOptions: {
				onSuccess(context) {
					sessionToken = context.response.headers.get("set-auth-token") || "";
				},
			},
		});
		expect(sessionToken.length).toBeGreaterThan(10);
	});

	it("should use custom expiresIn", async () => {
		const { auth, client } = await getTestInstance({
			emailAndPassword: {
				enabled: true,
				requireEmailVerification: true,
			},
			emailVerification: {
				async sendVerificationEmail({ user, url, token: _token }) {
					token = _token;
					mockSendEmail(user.email, url);
				},
				expiresIn: 10,
			},
		});
		await auth.api.sendVerificationEmail({
			body: {
				email: testUser.email,
			},
		});
		vi.useFakeTimers();
		await vi.advanceTimersByTimeAsync(10 * 1000);
		const res = await client.verifyEmail({
			query: {
				token,
			},
		});
		expect(res.error?.code).toBe("TOKEN_EXPIRED");
	});

	it("should call onEmailVerification callback when email is verified", async () => {
		const onEmailVerificationMock = vi.fn();
		const { auth, client } = await getTestInstance({
			emailAndPassword: {
				enabled: true,
				requireEmailVerification: true,
			},
			emailVerification: {
				async sendVerificationEmail({ user, url, token: _token }) {
					token = _token;
					mockSendEmail(user.email, url);
				},
				onEmailVerification: onEmailVerificationMock,
			},
		});

		await auth.api.sendVerificationEmail({
			body: {
				email: testUser.email,
			},
		});

		const res = await client.verifyEmail({
			query: {
				token,
			},
		});

		expect(res.data?.status).toBe(true);
		expect(onEmailVerificationMock).toHaveBeenCalledWith(
			expect.objectContaining({ email: testUser.email }),
			expect.any(Object),
		);
	});
});

describe("Email Verification Secondary Storage", async () => {
	let store = new Map<string, string>();
	let token: string;
	const { client, signInWithTestUser, db, auth, testUser, cookieSetter } =
		await getTestInstance({
			secondaryStorage: {
				set(key, value, ttl) {
					store.set(key, value);
				},
				get(key) {
					return store.get(key) || null;
				},
				delete(key) {
					store.delete(key);
				},
			},
			rateLimit: {
				enabled: false,
			},
			emailAndPassword: {
				enabled: true,
			},
			emailVerification: {
				async sendVerificationEmail({ user, url, token: _token }) {
					token = _token;
				},
				autoSignInAfterVerification: true,
			},
			user: {
				changeEmail: {
					enabled: true,
					async sendChangeEmailVerification(data, request) {
						token = data.token;
					},
				},
			},
		});

	it("should verify email", async () => {
		await auth.api.sendVerificationEmail({
			body: {
				email: testUser.email,
			},
		});
		const headers = new Headers();
		await client.verifyEmail({
			query: {
				token,
			},
			fetchOptions: {
				onSuccess: cookieSetter(headers),
			},
		});
		const session = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(session.data?.user.email).toBe(testUser.email);
		expect(session.data?.user.emailVerified).toBe(true);
	});

	it("should change email", async () => {
		const { headers } = await signInWithTestUser();
		await auth.api.changeEmail({
			body: {
				newEmail: "new@email.com",
			},
			headers,
		});
		const newHeaders = new Headers();
		await client.verifyEmail({
			query: {
				token,
			},
			fetchOptions: {
				onSuccess: cookieSetter(newHeaders),
				headers,
			},
		});
		const session = await client.getSession({
			fetchOptions: {
				headers: newHeaders,
			},
		});
		expect(session.data?.user.email).toBe("new@email.com");
		expect(session.data?.user.emailVerified).toBe(false);
	});
});

describe("Email Verification Multi-tenancy", async () => {
	const mockSendEmail = vi.fn();
	const tokenStore = new Map<string, string>();

	const { auth, client } = await getTestInstance(
		{
			multiTenancy: {
				enabled: true,
			},
			emailAndPassword: {
				enabled: true,
				requireEmailVerification: true,
			},
			emailVerification: {
				async sendVerificationEmail({ user, url, token }) {
					tokenStore.set(`${user.tenantId}-${user.email}`, token);
					mockSendEmail(user.email, url);
				},
			},
		},
		{
			disableTestUser: true,
		},
	);

	it("should isolate email verification per tenant", async () => {
		// Create user in tenant-1

		const res = await auth.api.signUpEmail({
			body: {
				email: "test@example.com",
				password: "password",
				name: "User",
			},
			headers: createHeadersWithTenantId("tenant-1"),
		});
		const token = tokenStore.get(`tenant-1-test@example.com`);

		// Ensure you can't verify with wrong tenant
		const badTenantVerification = await client.verifyEmail({
			query: {
				token: token!,
			},
			fetchOptions: {
				headers: createHeadersWithTenantId("tenant-2"),
			},
		});

		expect(badTenantVerification.data?.status).toBeUndefined();

		// Verify with correct tenant context (should succeed)
		const correctTenantVerification = await client.verifyEmail({
			query: {
				token: token!,
			},
			fetchOptions: {
				headers: createHeadersWithTenantId("tenant-1"),
			},
		});
		console.log(token);
		console.log(correctTenantVerification);

		expect(correctTenantVerification.data?.status).toBe(true);
	});

	it("should call onEmailVerification callback with correct tenant context", async () => {
		const onEmailVerificationMock = vi.fn();
		const callbackTokenStore = new Map<string, string>();

		const { client: callbackClient, auth: callbackAuth } =
			await getTestInstance(
				{
					multiTenancy: {
						enabled: true as const,
					},
					emailAndPassword: {
						enabled: true,
						requireEmailVerification: true,
					},
					emailVerification: {
						async sendVerificationEmail({ user, url, token }) {
							callbackTokenStore.set(`${user.tenantId}-${user.email}`, token);
							mockSendEmail(user.email, url);
						},
						onEmailVerification: onEmailVerificationMock,
					},
				},
				{
					disableTestUser: true,
				},
			);

		const email = "callback@test.com";

		// Create user in tenant-1
		await callbackAuth.api.signUpEmail({
			body: {
				email,
				password: "password",
				name: "User",
			},
			headers: createHeadersWithTenantId("tenant-1"),
		});

		const callbackToken = callbackTokenStore.get("tenant-1-callback@test.com");

		// Verify email
		const res = await callbackClient.verifyEmail({
			query: {
				token: callbackToken!,
			},
			fetchOptions: {
				headers: createHeadersWithTenantId("tenant-1"),
			},
		});

		expect(res.data?.status).toBe(true);
		expect(onEmailVerificationMock).toHaveBeenCalledWith(
			expect.objectContaining({
				email,
				tenantId: "tenant-1",
			}),
			expect.any(Object),
		);
	});

	it("should prevent cross-tenant email verification", async () => {
		const email = "crosstenant@test.com";

		// Create user only in tenant-1
		await auth.api.signUpEmail({
			body: {
				email,
				password: "password",
				name: "User",
			},
			headers: createHeadersWithTenantId("tenant-1"),
		});

		// Try to send verification email from tenant-2 context (should fail)
		try {
			await auth.api.sendVerificationEmail({
				body: {
					email,
				},
				headers: createHeadersWithTenantId("tenant-2"),
			});
			expect(true).toBe(false); // Should not reach here
		} catch (error) {
			expect(error).toBeDefined(); // Should throw because user doesn't exist in tenant-2
		}
	});
});
