import { afterEach, describe, expect, it, vi } from "vitest";
import { parseSetCookieHeader } from "../../cookies";
import { twoFactor } from "../../plugins";
import { getTestInstance } from "../../test-utils/test-instance";
import { expectNoTwoFactorChallenge } from "../../test-utils/two-factor";
import { createEmailVerificationToken } from "./email-verification";

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

	afterEach(() => {
		vi.useRealTimers();
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
		const data = res.data;
		if (!data) {
			throw new Error("Expected verification response");
		}
		expectNoTwoFactorChallenge(data);
		expect(data.status).toBe(true);
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
		const { testUser, client, sessionSetter, runWithUser } =
			await getTestInstance({
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

		// Attempt to update user info (should fail before verification)
		await runWithUser(testUser.email, testUser.password, async () => {
			const updateRes = await client.updateUser({
				name: "New Name",
				image: "https://example.com/image.jpg",
			});
			expect(updateRes.data).toBeNull();
			expect(updateRes.error!.status).toBe(401);
			expect(updateRes.error!.statusText).toBe("UNAUTHORIZED");
		});

		let sessionToken = "";
		const verifyHeaders = new Headers();
		await client.verifyEmail({
			query: {
				token,
			},
			fetchOptions: {
				onSuccess(context) {
					sessionToken = context.response.headers.get("set-auth-token") || "";
					sessionSetter(verifyHeaders)(context);
				},
			},
		});
		expect(sessionToken.length).toBeGreaterThan(10);
		const session = await client.getSession({
			fetchOptions: {
				headers: verifyHeaders,
				throw: true,
			},
		});
		expect(session!.user.emailVerified).toBe(true);
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

	it("should call afterEmailVerification callback when email is verified", async () => {
		const afterEmailVerificationMock = vi.fn();
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
				afterEmailVerification: afterEmailVerificationMock,
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
		const data = res.data;
		if (!data) {
			throw new Error("Expected verification response");
		}
		expectNoTwoFactorChallenge(data);
		expect(data.status).toBe(true);
		expect(afterEmailVerificationMock).toHaveBeenCalledWith(
			expect.objectContaining({ email: testUser.email }),
			expect.any(Object),
		);
	});

	it("should call beforeEmailVerification callback when email is verified", async () => {
		const beforeEmailVerificationMock = vi.fn();
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
				beforeEmailVerification: beforeEmailVerificationMock,
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
		const data = res.data;
		if (!data) {
			throw new Error("Expected verification response");
		}
		expectNoTwoFactorChallenge(data);
		expect(data.status).toBe(true);
		expect(beforeEmailVerificationMock).toHaveBeenCalledWith(
			expect.objectContaining({ email: testUser.email }),
			expect.any(Object),
		);
	});

	it("should call afterEmailVerification callback when email is verified", async () => {
		const afterEmailVerificationMock = vi.fn();
		const { auth, client, testUser } = await getTestInstance({
			emailAndPassword: {
				enabled: true,
				requireEmailVerification: true,
			},
			emailVerification: {
				async sendVerificationEmail({ user, url, token: _token }) {
					token = _token;
					mockSendEmail(user.email, url);
				},
				afterEmailVerification: afterEmailVerificationMock,
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
		const data = res.data;
		if (!data) {
			throw new Error("Expected verification response");
		}
		expectNoTwoFactorChallenge(data);
		expect(data.status).toBe(true);
		expect(afterEmailVerificationMock).toHaveBeenCalledWith(
			expect.objectContaining({ email: testUser.email, emailVerified: true }),
			expect.any(Object),
		);
	});

	it("should preserve encoded characters in callback URL", async () => {
		const testEmail = "test+user@example.com";
		const encodedEmail = encodeURIComponent(testEmail);
		const callbackURL = `/sign-in?verifiedEmail=${encodedEmail}`;

		await client.verifyEmail(
			{
				query: {
					token,
					callbackURL,
				},
			},
			{
				onError: (ctx) => {
					const location = ctx.response.headers.get("location");
					expect(location).toBe(`/sign-in?verifiedEmail=${encodedEmail}`);
					const url = new URL(location!, "http://localhost:3000");
					expect(url.searchParams.get("verifiedEmail")).toBe(testEmail);
				},
			},
		);
	});

	it("should properly encode callbackURL with query parameters when sending verification email", async () => {
		const mockSendEmailLocal = vi.fn();
		let capturedUrl = "";
		const { auth, testUser } = await getTestInstance({
			emailAndPassword: {
				enabled: true,
				requireEmailVerification: true,
			},
			emailVerification: {
				async sendVerificationEmail({ user, url, token: _token }) {
					capturedUrl = url;
					mockSendEmailLocal(user.email, url);
				},
			},
		});

		const callbackURL =
			"https://example.com/app?redirect=/dashboard&tab=settings";
		await auth.api.sendVerificationEmail({
			body: {
				email: testUser.email,
				callbackURL,
			},
		});
		expect(mockSendEmailLocal).toHaveBeenCalled();

		const emailUrl = new URL(capturedUrl);
		const callbackURLParam = emailUrl.searchParams.get("callbackURL");

		expect(callbackURLParam).toBe(callbackURL);
		expect(callbackURLParam).toContain("?redirect=/dashboard&tab=settings");
	});

	it("should not send verification email when a third party requests for an already verified user", async () => {
		const mockSendEmailLocal = vi.fn();
		let capturedToken = "";

		const { client, testUser } = await getTestInstance({
			emailAndPassword: {
				enabled: true,
				requireEmailVerification: true,
			},
			emailVerification: {
				async sendVerificationEmail({ token: _token }) {
					capturedToken = _token;
					mockSendEmailLocal();
				},
			},
		});

		// User requests verification email and verifies their email
		await client.sendVerificationEmail({
			email: testUser.email,
		});
		await client.verifyEmail({
			query: {
				token: capturedToken,
			},
		});

		mockSendEmailLocal.mockClear();

		// A third party (no session) tries to send verification emails
		// to an already verified user. This should NOT send an email.
		//
		// Note: client doesn't maintain session state between requests.
		const res = await client.sendVerificationEmail({
			email: testUser.email,
		});

		expect(res.data?.status).toBe(true);
		expect(mockSendEmailLocal).not.toHaveBeenCalled();
	});
});

describe("Email Verification two-factor challenge", async () => {
	it("should redirect auto sign-in through two-factor for enabled users", async () => {
		let verificationToken = "";
		const { client, auth, db, testUser } = await getTestInstance({
			emailAndPassword: {
				enabled: true,
				requireEmailVerification: true,
			},
			emailVerification: {
				autoSignInAfterVerification: true,
				async sendVerificationEmail({ token }) {
					verificationToken = token;
				},
			},
			plugins: [
				twoFactor({
					otpOptions: {
						async sendOTP() {},
					},
				}),
			],
		});

		await db.update({
			model: "user",
			update: {
				twoFactorEnabled: true,
			},
			where: [{ field: "email", value: testUser.email }],
		});

		await client.verifyEmail(
			{
				query: {
					token: verificationToken,
					callbackURL: "/dashboard",
				},
			},
			{
				onError(context) {
					expect(context.response.status).toBe(302);
					expect(context.response.headers.get("set-auth-token")).toBeNull();
					const location = context.response.headers.get("location");
					expect(location).toBeDefined();
					const redirectURL = new URL(location!, "http://localhost:3000");
					expect(redirectURL.pathname).toBe("/dashboard");
					expect(redirectURL.searchParams.get("challenge")).toBe("two-factor");
					expect(redirectURL.searchParams.get("attemptId")).toBeNull();
					expect(redirectURL.searchParams.get("methods")).toBe("otp");

					const cookies = parseSetCookieHeader(
						context.response.headers.get("set-cookie") || "",
					);
					expect(cookies.get("better-auth.two_factor")?.value).toBeDefined();
				},
			},
		);

		const context = await auth.$context;
		const user = await context.internalAdapter.findUserByEmail(testUser.email);
		expect(user?.user.id).toBeDefined();
		const sessions = await context.internalAdapter.listSessions(user!.user.id);
		expect(sessions).toHaveLength(0);
	});

	it("should challenge change-email verification links before reopening a session", async () => {
		const newEmail = "challenge-change-email@example.com";
		const { client, auth, db, testUser } = await getTestInstance({
			emailAndPassword: {
				enabled: true,
			},
			plugins: [
				twoFactor({
					otpOptions: {
						async sendOTP() {},
					},
				}),
			],
		});

		const context = await auth.$context;
		const originalUser = await context.internalAdapter.findUserByEmail(
			testUser.email,
		);
		if (!originalUser) {
			throw new Error("Expected test user");
		}

		await db.update({
			model: "user",
			update: {
				twoFactorEnabled: true,
			},
			where: [{ field: "email", value: testUser.email }],
		});

		const verificationToken = await createEmailVerificationToken(
			context.secret,
			testUser.email,
			newEmail,
			undefined,
			{ requestType: "change-email-verification" },
		);
		const beforeSessions = await context.internalAdapter.listSessions(
			originalUser.user.id,
		);

		await client.verifyEmail(
			{
				query: {
					token: verificationToken,
					callbackURL: "/settings",
				},
			},
			{
				onError(context) {
					expect(context.response.status).toBe(302);
					expect(context.response.headers.get("set-auth-token")).toBeNull();
					const location = context.response.headers.get("location");
					expect(location).toBeDefined();
					const redirectURL = new URL(location!, "http://localhost:3000");
					expect(redirectURL.pathname).toBe("/settings");
					expect(redirectURL.searchParams.get("challenge")).toBe("two-factor");
					expect(redirectURL.searchParams.get("attemptId")).toBeNull();
					expect(redirectURL.searchParams.get("methods")).toBe("otp");

					const cookies = parseSetCookieHeader(
						context.response.headers.get("set-cookie") || "",
					);
					expect(cookies.get("better-auth.two_factor")?.value).toBeDefined();
					expect(cookies.get("better-auth.session_token")).toBeUndefined();
					expect(cookies.get("better-auth.session_data")).toBeUndefined();
				},
			},
		);

		const afterSessions = await context.internalAdapter.listSessions(
			originalUser.user.id,
		);
		expect(afterSessions).toHaveLength(beforeSessions.length);
	});

	it("should challenge legacy change-email verification links before reopening a session", async () => {
		let followUpVerificationToken = "";
		const newEmail = "legacy-change-email@example.com";
		const { client, auth, db, testUser } = await getTestInstance({
			emailAndPassword: {
				enabled: true,
			},
			emailVerification: {
				async sendVerificationEmail({ token }) {
					followUpVerificationToken = token;
				},
			},
			plugins: [
				twoFactor({
					otpOptions: {
						async sendOTP() {},
					},
				}),
			],
		});

		await db.update({
			model: "user",
			update: {
				twoFactorEnabled: true,
			},
			where: [{ field: "email", value: testUser.email }],
		});

		const context = await auth.$context;
		const originalUser = await context.internalAdapter.findUserByEmail(
			testUser.email,
		);
		if (!originalUser) {
			throw new Error("Expected test user");
		}

		const legacyToken = await createEmailVerificationToken(
			context.secret,
			testUser.email,
			newEmail,
		);
		const beforeSessions = await context.internalAdapter.listSessions(
			originalUser.user.id,
		);

		await client.verifyEmail(
			{
				query: {
					token: legacyToken,
					callbackURL: "/settings",
				},
			},
			{
				onError(context) {
					expect(context.response.status).toBe(302);
					expect(context.response.headers.get("set-auth-token")).toBeNull();
					const location = context.response.headers.get("location");
					expect(location).toBeDefined();
					const redirectURL = new URL(location!, "http://localhost:3000");
					expect(redirectURL.pathname).toBe("/settings");
					expect(redirectURL.searchParams.get("challenge")).toBe("two-factor");
					expect(redirectURL.searchParams.get("attemptId")).toBeNull();
					expect(redirectURL.searchParams.get("methods")).toBe("otp");

					const cookies = parseSetCookieHeader(
						context.response.headers.get("set-cookie") || "",
					);
					expect(cookies.get("better-auth.two_factor")?.value).toBeDefined();
					expect(cookies.get("better-auth.session_token")).toBeUndefined();
					expect(cookies.get("better-auth.session_data")).toBeUndefined();
				},
			},
		);

		expect(followUpVerificationToken).toBeTruthy();
		const afterSessions = await context.internalAdapter.listSessions(
			originalUser.user.id,
		);
		expect(afterSessions).toHaveLength(beforeSessions.length);
	});
});

describe("Email Verification Secondary Storage", async () => {
	const store = new Map<string, string>();
	let token: string;
	const { client, signInWithTestUser, auth, testUser, cookieSetter } =
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
					async sendChangeEmailConfirmation(data, request) {
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
		const { runWithUser } = await signInWithTestUser();
		await runWithUser(async (headers) => {
			await auth.api.changeEmail({
				body: {
					newEmail: "new@email.com",
				},
				headers,
			});

			// 1. Verify confirmation token (sent to old email)
			const confirmationHeaders = new Headers();
			await client.verifyEmail({
				query: {
					token,
				},
				fetchOptions: {
					onSuccess: cookieSetter(confirmationHeaders),
					headers,
				},
			});

			// Check that email is NOT updated yet
			const sessionAfterConfirmation = await client.getSession({
				fetchOptions: {
					headers: confirmationHeaders,
				},
			});
			expect(sessionAfterConfirmation.data?.user.email).toBe(testUser.email);

			// 2. Verify new email token (token variable was updated by sendVerificationEmail mock)
			const verificationHeaders = new Headers();
			await client.verifyEmail({
				query: {
					token,
				},
				fetchOptions: {
					onSuccess: cookieSetter(verificationHeaders),
					headers: confirmationHeaders,
				},
			});

			const session = await client.getSession({
				fetchOptions: {
					headers: verificationHeaders,
				},
			});
			expect(session.data?.user.email).toBe("new@email.com");
			expect(session.data?.user.emailVerified).toBe(true);
		});
	});

	it("should set emailVerified on all sessions", async () => {
		const sampleUser = {
			name: "sampler",
			email: "sample@sample.com",
			password: "sample-password",
		};

		await client.signUp.email({
			name: sampleUser.name,
			email: sampleUser.email,
			password: sampleUser.password,
		});

		const secondSignInHeaders = new Headers();
		await client.signIn.email(
			{
				email: sampleUser.email,
				password: sampleUser.password,
			},
			{
				onSuccess: cookieSetter(secondSignInHeaders),
			},
		);

		await auth.api.sendVerificationEmail({
			body: {
				email: sampleUser.email,
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

		expect(session.data?.user.email).toBe(sampleUser.email);
		expect(session.data?.user.emailVerified).toBe(true);

		const secondSignInSession = await client.getSession({
			fetchOptions: {
				headers: secondSignInHeaders,
			},
		});

		expect(secondSignInSession.data?.user.email).toBe(sampleUser.email);
		expect(secondSignInSession.data?.user.emailVerified).toBe(true);
	});

	it("should set emailVerified on all sessions", async () => {
		const sampleUser = {
			name: "sampler2",
			email: "sample2@sample.com",
			password: "sample-password",
		};

		await client.signUp.email({
			name: sampleUser.name,
			email: sampleUser.email,
			password: sampleUser.password,
		});

		const secondSignInHeaders = new Headers();
		await client.signIn.email(
			{
				email: sampleUser.email,
				password: sampleUser.password,
			},
			{
				onSuccess: cookieSetter(secondSignInHeaders),
			},
		);

		await auth.api.sendVerificationEmail({
			body: {
				email: sampleUser.email,
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

		expect(session.data?.user.email).toBe(sampleUser.email);
		expect(session.data?.user.emailVerified).toBe(true);

		const secondSignInSession = await client.getSession({
			fetchOptions: {
				headers: secondSignInHeaders,
			},
		});

		expect(secondSignInSession.data?.user.email).toBe(sampleUser.email);
		expect(secondSignInSession.data?.user.emailVerified).toBe(true);
	});

	it("should call hooks when verifying email change (change-email-verification)", async () => {
		const afterEmailVerificationMock = vi.fn();
		let capturedToken: string;

		const { client, auth, signInWithTestUser, cookieSetter } =
			await getTestInstance({
				emailAndPassword: {
					enabled: true,
				},
				emailVerification: {
					async sendVerificationEmail({ token: _token }) {
						capturedToken = _token;
					},
					afterEmailVerification: afterEmailVerificationMock,
				},
				user: {
					changeEmail: {
						enabled: true,
						async sendChangeEmailConfirmation(data) {
							capturedToken = data.token;
						},
					},
				},
			});

		const { runWithUser } = await signInWithTestUser();

		await runWithUser(async (headers) => {
			// Request email change
			await auth.api.changeEmail({
				body: {
					newEmail: "newemail@example.com",
				},
				headers,
			});

			// Verify new email (change-email-verification flow)
			const verificationHeaders = new Headers();
			await client.verifyEmail({
				query: {
					token: capturedToken,
				},
				fetchOptions: {
					onSuccess: cookieSetter(verificationHeaders),
					headers,
				},
			});

			// Hooks should be called when email is verified
			expect(afterEmailVerificationMock).toHaveBeenCalledWith(
				expect.objectContaining({
					email: "newemail@example.com",
					emailVerified: true,
				}),
				expect.any(Object),
			);
		});
	});
});
