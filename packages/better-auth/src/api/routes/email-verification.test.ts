import { APIError } from "@better-auth/core/error";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import type { Session, User } from "../../types";
import { createEmailVerificationToken } from "./email-verification";

/**
 * @see https://github.com/better-auth/better-auth/issues/8969
 */
describe("Email Verification - Request body consumption bug", () => {
	/**
	 * @see https://github.com/better-auth/better-auth/issues/10335
	 */
	it("should not fail sign-up when callback request cloning throws", async () => {
		const originalClone = Request.prototype.clone;
		const mockSendEmail = vi.fn();
		let cloneCalls = 0;

		const cloneSpy = vi
			.spyOn(Request.prototype, "clone")
			.mockImplementation(function (this: Request) {
				cloneCalls += 1;
				if (cloneCalls > 1) {
					throw new TypeError("unusable");
				}
				return originalClone.call(this);
			});

		const { auth } = await getTestInstance(
			{
				emailAndPassword: {
					enabled: true,
				},
				emailVerification: {
					sendOnSignUp: true,
					async sendVerificationEmail({ user }, request) {
						mockSendEmail(
							user.email,
							request?.method,
							request?.url,
							await request?.text(),
						);
					},
				},
			},
			{
				disableTestUser: true,
			},
		);

		try {
			const response = await auth.handler(
				new Request("http://localhost:3000/api/auth/sign-up/email", {
					method: "POST",
					headers: {
						"content-type": "application/json",
					},
					body: JSON.stringify({
						name: "Test User",
						email: "clone-throws@example.com",
						password: "password123",
					}),
				}),
			);

			expect(response.status).toBe(200);
			expect(mockSendEmail).toHaveBeenCalledWith(
				"clone-throws@example.com",
				"POST",
				"http://localhost:3000/api/auth/sign-up/email",
				"",
			);
		} finally {
			cloneSpy.mockRestore();
		}
	});

	it("should not throw 'body already consumed' error when sendVerificationEmail callback reads the request", async () => {
		const mockSendEmail = vi.fn();
		let requestBodyReadError: Error | null = null;

		const { auth, testUser } = await getTestInstance({
			emailAndPassword: {
				enabled: true,
				requireEmailVerification: true,
			},
			emailVerification: {
				async sendVerificationEmail({ user, url, token }, request) {
					mockSendEmail(user.email, url);
					if (request) {
						try {
							await request.text();
						} catch (error) {
							requestBodyReadError = error as Error;
						}
					}
				},
			},
		});

		await auth.api.sendVerificationEmail({
			body: {
				email: testUser.email,
			},
		});

		expect(mockSendEmail).toHaveBeenCalledWith(
			testUser.email,
			expect.any(String),
		);
		expect(requestBodyReadError).toBeNull();
	});

	it("should not throw 'body already consumed' error when sendVerificationEmail is called during sign-up", async () => {
		const mockSendEmail = vi.fn();
		let requestBodyReadError: Error | null = null;

		const { client } = await getTestInstance({
			emailAndPassword: {
				enabled: true,
				requireEmailVerification: true,
			},
			emailVerification: {
				sendOnSignUp: true,
				async sendVerificationEmail({ user, url, token }, request) {
					mockSendEmail(user.email, url);
					if (request) {
						try {
							await request.text();
						} catch (error) {
							requestBodyReadError = error as Error;
						}
					}
				},
			},
		});

		await client.signUp.email({
			name: "Test User",
			email: "newuser@example.com",
			password: "password123",
		});

		expect(mockSendEmail).toHaveBeenCalledWith(
			"newuser@example.com",
			expect.any(String),
		);
		expect(requestBodyReadError).toBeNull();
	});

	it("should not throw 'body already consumed' error when sendVerificationEmail is called during sign-in", async () => {
		const mockSendEmail = vi.fn();
		let requestBodyReadError: Error | null = null;

		const { client, testUser } = await getTestInstance({
			emailAndPassword: {
				enabled: true,
				requireEmailVerification: true,
			},
			emailVerification: {
				sendOnSignIn: true,
				async sendVerificationEmail({ user, url, token }, request) {
					mockSendEmail(user.email, url);
					if (request) {
						try {
							await request.text();
						} catch (error) {
							requestBodyReadError = error as Error;
						}
					}
				},
			},
		});

		try {
			await client.signIn.email({
				email: testUser.email,
				password: testUser.password,
			});
		} catch {
			// Expected to throw EMAIL_NOT_VERIFIED, but we're testing the request body
		}

		expect(mockSendEmail).toHaveBeenCalledWith(
			testUser.email,
			expect.any(String),
		);
		expect(requestBodyReadError).toBeNull();
	});
});

describe("Email Verification", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("should send a verification email when enabled", async () => {
		const sendVerificationEmail = vi.fn();
		const { auth, testUser } = await getTestInstance({
			emailAndPassword: {
				enabled: true,
				requireEmailVerification: true,
			},
			emailVerification: {
				sendOnSignUp: false,
				sendVerificationEmail,
			},
		});

		await auth.api.sendVerificationEmail({
			body: {
				email: testUser.email,
			},
		});
		expect(sendVerificationEmail).toHaveBeenCalledExactlyOnceWith(
			expect.objectContaining({
				user: expect.objectContaining({ email: testUser.email }),
				url: expect.any(String),
			}),
			undefined,
		);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/8757
	 */
	it("should return APIError status when sendVerificationEmail throws (e.g. rate limit)", async () => {
		let sendCalls = 0;
		const { auth, testUser } = await getTestInstance({
			emailAndPassword: {
				enabled: true,
				requireEmailVerification: true,
			},
			emailVerification: {
				async sendVerificationEmail() {
					sendCalls += 1;
					if (sendCalls >= 2) {
						throw APIError.from("TOO_MANY_REQUESTS", {
							code: "RATE_LIMIT_EXCEEDED",
							message: "Too many requests. Please try again later.",
						});
					}
				},
			},
		});

		try {
			await auth.api.sendVerificationEmail({
				body: {
					email: testUser.email,
				},
			});
			expect.fail("Expected sendVerificationEmail to throw");
		} catch (error) {
			expect(error).toBeInstanceOf(APIError);
			if (error instanceof APIError) {
				expect(error.status).toBe("TOO_MANY_REQUESTS");
				expect(error.body?.code).toBe("RATE_LIMIT_EXCEEDED");
			}
		}
	});

	it("should send a verification email if verification is required and user is not verified", async () => {
		const sendVerificationEmail = vi.fn();
		const { client, testUser } = await getTestInstance({
			emailAndPassword: { enabled: true, requireEmailVerification: true },
			emailVerification: {
				sendOnSignUp: false,
				sendOnSignIn: true,
				sendVerificationEmail,
			},
		});

		const result = await client.signIn.email(testUser);

		expect(result.error?.code).toBe("EMAIL_NOT_VERIFIED");
		expect(sendVerificationEmail).toHaveBeenCalledExactlyOnceWith(
			expect.objectContaining({
				user: expect.objectContaining({ email: testUser.email }),
				url: expect.any(String),
			}),
			expect.anything(),
		);
	});

	it("should verify email", async () => {
		let token = "";
		const { auth, client, testUser } = await getTestInstance({
			emailAndPassword: {
				enabled: true,
				requireEmailVerification: true,
			},
			emailVerification: {
				sendOnSignUp: false,
				async sendVerificationEmail({ token: verificationToken }) {
					token = verificationToken;
				},
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
	});

	it("should redirect to callback", async () => {
		let token = "";
		const { auth, client, testUser } = await getTestInstance({
			emailAndPassword: {
				enabled: true,
				requireEmailVerification: true,
			},
			emailVerification: {
				sendOnSignUp: false,
				async sendVerificationEmail({ token: verificationToken }) {
					token = verificationToken;
				},
			},
		});
		await auth.api.sendVerificationEmail({
			body: {
				email: testUser.email,
			},
		});

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
		let token = "";
		const { auth, testUser, client, sessionSetter, runWithUser } =
			await getTestInstance({
				emailAndPassword: {
					enabled: true,
					requireEmailVerification: true,
				},
				emailVerification: {
					sendOnSignUp: false,
					async sendVerificationEmail({ token: verificationToken }) {
						token = verificationToken;
					},
					autoSignInAfterVerification: true,
				},
			});
		await auth.api.sendVerificationEmail({
			body: {
				email: testUser.email,
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
		let token = "";
		const { auth, client, testUser } = await getTestInstance({
			emailAndPassword: {
				enabled: true,
				requireEmailVerification: true,
			},
			emailVerification: {
				sendOnSignUp: false,
				async sendVerificationEmail({ token: verificationToken }) {
					token = verificationToken;
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
		let token = "";
		const { auth, client, testUser } = await getTestInstance({
			emailAndPassword: {
				enabled: true,
				requireEmailVerification: true,
			},
			emailVerification: {
				sendOnSignUp: false,
				async sendVerificationEmail({ token: verificationToken }) {
					token = verificationToken;
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

		expect(res.data?.status).toBe(true);
		expect(afterEmailVerificationMock).toHaveBeenCalledWith(
			expect.objectContaining({ email: testUser.email }),
			expect.any(Object),
		);
	});

	it("should call beforeEmailVerification callback when email is verified", async () => {
		const beforeEmailVerificationMock = vi.fn();
		let token = "";
		const { auth, client, testUser } = await getTestInstance({
			emailAndPassword: {
				enabled: true,
				requireEmailVerification: true,
			},
			emailVerification: {
				sendOnSignUp: false,
				async sendVerificationEmail({ token: verificationToken }) {
					token = verificationToken;
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

		expect(res.data?.status).toBe(true);
		expect(beforeEmailVerificationMock).toHaveBeenCalledWith(
			expect.objectContaining({ email: testUser.email }),
			expect.any(Object),
		);
	});

	it("should call afterEmailVerification callback when email is verified", async () => {
		const afterEmailVerificationMock = vi.fn();
		let token = "";
		const { auth, client, testUser } = await getTestInstance({
			emailAndPassword: {
				enabled: true,
				requireEmailVerification: true,
			},
			emailVerification: {
				sendOnSignUp: false,
				async sendVerificationEmail({ token: verificationToken }) {
					token = verificationToken;
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

		expect(res.data?.status).toBe(true);
		expect(afterEmailVerificationMock).toHaveBeenCalledWith(
			expect.objectContaining({ email: testUser.email, emailVerified: true }),
			expect.any(Object),
		);
	});

	it("should preserve encoded characters in callback URL", async () => {
		const testEmail = "test+user@example.com";
		const encodedEmail = encodeURIComponent(testEmail);
		const callbackURL = `/sign-in?verifiedEmail=${encodedEmail}`;
		let token = "";
		const { auth, client, testUser } = await getTestInstance({
			emailAndPassword: {
				enabled: true,
				requireEmailVerification: true,
			},
			emailVerification: {
				sendOnSignUp: false,
				async sendVerificationEmail({ token: verificationToken }) {
					token = verificationToken;
				},
			},
		});
		await auth.api.sendVerificationEmail({
			body: {
				email: testUser.email,
			},
		});

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

describe("Email Verification - Timing-safe unauthenticated path", () => {
	it("should enforce a constant-time floor for both existing and non-existing emails", async () => {
		const mockSendEmail = vi.fn();
		const { auth, testUser } = await getTestInstance({
			emailAndPassword: {
				enabled: true,
				requireEmailVerification: true,
			},
			emailVerification: {
				async sendVerificationEmail({ user }) {
					mockSendEmail(user.email);
				},
			},
		});

		const startExisting = Date.now();
		await auth.api.sendVerificationEmail({
			body: { email: testUser.email },
		});
		const elapsedExisting = Date.now() - startExisting;

		const startMissing = Date.now();
		await auth.api.sendVerificationEmail({
			body: { email: "nonexistent@example.com" },
		});
		const elapsedMissing = Date.now() - startMissing;

		expect(elapsedExisting).toBeGreaterThanOrEqual(450);
		expect(elapsedMissing).toBeGreaterThanOrEqual(450);

		expect(mockSendEmail).toHaveBeenCalledWith(testUser.email);
		expect(mockSendEmail).not.toHaveBeenCalledWith("nonexistent@example.com");
	});

	it("should still surface errors from sendVerificationEmail after the minimum delay", async () => {
		let calls = 0;
		const { auth, testUser } = await getTestInstance({
			emailAndPassword: {
				enabled: true,
				requireEmailVerification: true,
			},
			emailVerification: {
				async sendVerificationEmail() {
					calls += 1;
					if (calls >= 2) {
						throw APIError.from("TOO_MANY_REQUESTS", {
							code: "RATE_LIMIT_EXCEEDED",
							message: "Too many requests.",
						});
					}
				},
			},
		});

		const start = Date.now();
		try {
			await auth.api.sendVerificationEmail({
				body: { email: testUser.email },
			});
			expect.fail("Expected to throw");
		} catch (error) {
			expect(error).toBeInstanceOf(APIError);
			if (error instanceof APIError) {
				expect(error.status).toBe("TOO_MANY_REQUESTS");
			}
		}
		const elapsed = Date.now() - start;
		expect(elapsed).toBeGreaterThanOrEqual(450);
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

	it("should handle email case insensitivity when sending verification email while signed in", async () => {
		const sendVerificationEmail = vi.fn();
		const { auth, signInWithUser } = await getTestInstance({
			emailAndPassword: {
				enabled: true,
			},
			emailVerification: {
				sendVerificationEmail,
			},
		});

		const mixedCaseEmail = "Test.Email.Case@Example.COM";
		const password = "password123";

		const signUpResult = await auth.api.signUpEmail({
			body: {
				email: mixedCaseEmail,
				password,
				name: "Test User",
			},
		});
		expect(signUpResult.user.email).toBe(mixedCaseEmail.toLowerCase());
		expect(signUpResult.user.emailVerified).toBe(false);

		const { headers } = await signInWithUser(
			mixedCaseEmail.toLowerCase(),
			password,
		);

		const session = await auth.api.getSession({ headers });
		expect(session).toBeTruthy();
		expect(session?.user.email).toBe(mixedCaseEmail.toLowerCase());
		expect(session?.user.emailVerified).toBe(false);

		const result = await auth.api.sendVerificationEmail({
			body: {
				email: mixedCaseEmail.toUpperCase(),
			},
			headers,
		});
		expect(result.status).toBe(true);
	});
});

/**
 * @see https://github.com/better-auth/better-auth/issues/11754
 *
 * Change-email verification links clicked in an unauthenticated context
 * (separate browser, incognito window, expired session) must not mint a
 * session or set a session cookie unless autoSignInAfterVerification is
 * explicitly enabled - the same contract the plain verification path
 * (email-verification.ts) and the email-OTP path already enforce.
 */
describe("Email change verification - auto sign-in contract", async () => {
	let confirmationToken: string;
	let verificationToken: string;
	const {
		client,
		auth,
		testUser,
		signInWithTestUser,
		signInWithUser,
		cookieSetter,
		db,
	} = await getTestInstance({
		emailAndPassword: {
			enabled: true,
		},
		emailVerification: {
			sendOnSignUp: false,
			async sendVerificationEmail({ token: _token }) {
				verificationToken = _token;
			},
			// The contract under test: auto sign-in is opt-in and defaults to false.
			autoSignInAfterVerification: false,
		},
		user: {
			changeEmail: {
				enabled: true,
				async sendChangeEmailConfirmation(data) {
					confirmationToken = data.token;
				},
			},
		},
	});

	it("should not mint a session for an unauthenticated change-email verification click when autoSignInAfterVerification is false", async () => {
		// Verify the test user so change-email takes the two-step flow
		await auth.api.sendVerificationEmail({
			body: {
				email: testUser.email,
			},
		});
		const plainHeaders = new Headers();
		await client.verifyEmail({
			query: {
				token: verificationToken,
			},
			fetchOptions: {
				onSuccess: cookieSetter(plainHeaders),
			},
		});
		const plainSession = await client.getSession({
			fetchOptions: { headers: plainHeaders },
		});
		// sanity: the plain verification path already respects the flag
		expect(plainSession.data).toBeNull();

		const { runWithUser } = await signInWithTestUser();
		await runWithUser(async (headers) => {
			await auth.api.changeEmail({
				body: {
					newEmail: "unauth-new@email.com",
				},
				headers,
			});
		});
		expect(confirmationToken).toBeTruthy();

		// Baseline for the persistence assertions below: the explicit
		// sign-in above must be the only source of the user's session rows.
		const dbUser = await db.findOne<User>({
			model: "user",
			where: [{ field: "email", value: testUser.email }],
		});
		const changeUserId = dbUser?.id as string;
		expect(changeUserId).toBeTruthy();
		const sessionsBefore = await db.findMany<Session>({
			model: "session",
			where: [{ field: "userId", value: changeUserId }],
		});
		expect(sessionsBefore.length).toBeGreaterThan(0);

		// Click the confirmation link in a separate browser (no session)
		await client.verifyEmail({
			query: {
				token: confirmationToken,
			},
		});
		expect(verificationToken).toBeTruthy();
		const changeVerificationToken = verificationToken;

		// Click the final verification link unauthenticated (incognito window)
		const capturedHeaders = new Headers();
		const res = await client.verifyEmail({
			query: {
				token: changeVerificationToken,
			},
			fetchOptions: {
				onSuccess: cookieSetter(capturedHeaders),
			},
		});

		// The email change must still complete...
		expect(res.data?.status).toBe(true);

		// ...but no session may be minted and no session cookie set
		const session = await client.getSession({
			fetchOptions: { headers: capturedHeaders },
		});
		expect(session.data).toBeNull();

		// ...and no session row may be persisted either: getSession alone
		// cannot tell a minted-but-cookie-less session from no session at all
		const sessionsAfter = await db.findMany<Session>({
			model: "session",
			where: [{ field: "userId", value: changeUserId }],
		});
		expect(sessionsAfter.map((row) => row.id).sort()).toEqual(
			sessionsBefore.map((row) => row.id).sort(),
		);

		// The account is intact and usable with the new email
		const signInRes = await client.signIn.email({
			email: "unauth-new@email.com",
			password: testUser.password,
		});
		expect(signInRes.data?.user?.email).toBe("unauth-new@email.com");
		expect(signInRes.data?.user?.emailVerified).toBe(true);
	});

	it("should keep refreshing the session cookie for an authenticated change-email verification click when autoSignInAfterVerification is false", async () => {
		// fresh, verified user so change-email takes the two-step flow
		const secondUser = {
			name: "second user",
			email: "second@test.com",
			password: "test123456",
		};
		await client.signUp.email({
			name: secondUser.name,
			email: secondUser.email,
			password: secondUser.password,
		});
		await auth.api.sendVerificationEmail({
			body: { email: secondUser.email },
		});
		const plainHeaders = new Headers();
		await client.verifyEmail({
			query: { token: verificationToken },
			fetchOptions: { onSuccess: cookieSetter(plainHeaders) },
		});

		const { headers } = await signInWithUser(
			secondUser.email,
			secondUser.password,
		);
		await auth.api.changeEmail({
			body: { newEmail: "with-session-new@email.com" },
			headers,
		});
		expect(confirmationToken).toBeTruthy();
		await client.verifyEmail({
			query: { token: confirmationToken },
			fetchOptions: { headers },
		});
		const changeVerificationToken = verificationToken;

		const capturedHeaders = new Headers();
		await client.verifyEmail({
			query: { token: changeVerificationToken },
			fetchOptions: {
				headers,
				onSuccess: cookieSetter(capturedHeaders),
			},
		});

		const session = await client.getSession({
			fetchOptions: { headers: capturedHeaders },
		});
		expect(session.data?.user.email).toBe("with-session-new@email.com");
		expect(session.data?.user.emailVerified).toBe(true);
	});
});

describe("Legacy change-email verification - auto sign-in contract", async () => {
	const { client, db, cookieSetter } = await getTestInstance({
		emailAndPassword: {
			enabled: true,
		},
		emailVerification: {
			sendOnSignUp: false,
			async sendVerificationEmail() {},
			autoSignInAfterVerification: false,
		},
	});

	it("should not mint a session for an unauthenticated legacy change-email token when autoSignInAfterVerification is false", async () => {
		const legacyUser = {
			name: "legacy user",
			email: "legacy@test.com",
			password: "test123456",
		};
		await client.signUp.email({
			name: legacyUser.name,
			email: legacyUser.email,
			password: legacyUser.password,
		});

		// Baseline: the user's session rows before the legacy click
		const dbUser = await db.findOne<User>({
			model: "user",
			where: [{ field: "email", value: legacyUser.email }],
		});
		const legacyUserId = dbUser?.id as string;
		expect(legacyUserId).toBeTruthy();
		const sessionsBefore = await db.findMany<Session>({
			model: "session",
			where: [{ field: "userId", value: legacyUserId }],
		});

		// Legacy token shape: updateTo set, no requestType
		const legacyToken = await createEmailVerificationToken(
			"better-auth-secret-that-is-long-enough-for-validation-test",
			legacyUser.email,
			"legacy-new@test.com",
		);

		const capturedHeaders = new Headers();
		const res = await client.verifyEmail({
			query: { token: legacyToken },
			fetchOptions: {
				onSuccess: cookieSetter(capturedHeaders),
			},
		});

		expect(res.data?.status).toBe(true);

		const session = await client.getSession({
			fetchOptions: { headers: capturedHeaders },
		});
		expect(session.data).toBeNull();

		// Same persistence guard as the two-step flow: no session row either
		const sessionsAfter = await db.findMany<Session>({
			model: "session",
			where: [{ field: "userId", value: legacyUserId }],
		});
		expect(sessionsAfter.map((row) => row.id).sort()).toEqual(
			sessionsBefore.map((row) => row.id).sort(),
		);

		const signInRes = await client.signIn.email({
			email: "legacy-new@test.com",
			password: legacyUser.password,
		});
		expect(signInRes.data?.user?.email).toBe("legacy-new@test.com");
		// the legacy flow updates the email but leaves it unverified
		expect(signInRes.data?.user?.emailVerified).toBe(false);
	});
});

describe("Change-email verification auto sign-in opt-in", async () => {
	let confirmationToken: string;
	let verificationToken: string;
	const { client, auth, testUser, signInWithTestUser, db, cookieSetter } =
		await getTestInstance({
			emailAndPassword: {
				enabled: true,
			},
			emailVerification: {
				sendOnSignUp: false,
				async sendVerificationEmail({ token: _token }) {
					verificationToken = _token;
				},
				autoSignInAfterVerification: true,
			},
			user: {
				changeEmail: {
					enabled: true,
					async sendChangeEmailConfirmation(data) {
						confirmationToken = data.token;
					},
				},
			},
		});

	it("should mint a session for an unauthenticated change-email verification click when autoSignInAfterVerification is true", async () => {
		await auth.api.sendVerificationEmail({
			body: { email: testUser.email },
		});
		await client.verifyEmail({
			query: { token: verificationToken },
		});

		const { runWithUser } = await signInWithTestUser();
		await runWithUser(async (headers) => {
			await auth.api.changeEmail({
				body: { newEmail: "optin-new@email.com" },
				headers,
			});
		});
		await client.verifyEmail({
			query: { token: confirmationToken },
		});
		const changeVerificationToken = verificationToken;

		// Baseline before the minting click
		const dbUser = await db.findOne<User>({
			model: "user",
			where: [{ field: "email", value: testUser.email }],
		});
		const optInUserId = dbUser?.id as string;
		expect(optInUserId).toBeTruthy();
		const sessionsBefore = await db.findMany<Session>({
			model: "session",
			where: [{ field: "userId", value: optInUserId }],
		});

		const capturedHeaders = new Headers();
		await client.verifyEmail({
			query: { token: changeVerificationToken },
			fetchOptions: {
				onSuccess: cookieSetter(capturedHeaders),
			},
		});

		const session = await client.getSession({
			fetchOptions: { headers: capturedHeaders },
		});
		expect(session.data?.user.email).toBe("optin-new@email.com");
		expect(session.data?.user.emailVerified).toBe(true);

		// Control for the negative tests above: the opt-in path must persist
		// exactly one new session row
		const sessionsAfter = await db.findMany<Session>({
			model: "session",
			where: [{ field: "userId", value: optInUserId }],
		});
		expect(sessionsAfter).toHaveLength(sessionsBefore.length + 1);
		const added = sessionsAfter.filter(
			(row) => !sessionsBefore.some((before) => before.id === row.id),
		);
		expect(added).toHaveLength(1);
	});
});
