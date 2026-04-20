import { afterEach, describe, expect, it, vi } from "vitest";
import { createAuthClient } from "../../client";
import { parseSetCookieHeader } from "../../cookies";
import { getTestInstance } from "../../test-utils/test-instance";
import { expectNoTwoFactorChallenge } from "../../test-utils/two-factor";
import { DEFAULT_SECRET } from "../../utils/constants";
import { twoFactor } from "../two-factor";
import { magicLink } from ".";
import { magicLinkClient } from "./client";
import { defaultKeyHasher } from "./utils";

type VerificationEmail = {
	email: string;
	token: string;
	url: string;
	metadata?: Record<string, any>;
};

describe("magic link", async () => {
	let verificationEmail: VerificationEmail = {
		email: "",
		token: "",
		url: "",
	};
	const { auth, customFetchImpl, testUser, sessionSetter } =
		await getTestInstance({
			plugins: [
				magicLink({
					async sendMagicLink(data) {
						verificationEmail = data;
					},
				}),
			],
		});

	const client = createAuthClient({
		plugins: [magicLinkClient()],
		fetchOptions: {
			customFetchImpl,
		},
		baseURL: "http://localhost:3000",
		basePath: "/api/auth",
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("should send magic link", async () => {
		await client.signIn.magicLink({
			email: testUser.email,
		});
		expect(verificationEmail).toMatchObject({
			email: testUser.email,
			url: expect.stringContaining(
				"http://localhost:3000/api/auth/magic-link/verify",
			),
		});
		expect(verificationEmail.metadata).toBeUndefined();
	});

	it("should forward metadata to sendMagicLink", async () => {
		await client.signIn.magicLink({
			email: testUser.email,
			metadata: {
				inviteId: "123",
			},
		});

		expect(verificationEmail).toMatchObject({
			email: testUser.email,
			metadata: {
				inviteId: "123",
			},
		});
	});
	it("should verify magic link", async () => {
		const headers = new Headers();
		const response = await client.magicLink.verify({
			query: {
				token: new URL(verificationEmail.url).searchParams.get("token") || "",
			},
			fetchOptions: {
				onSuccess: sessionSetter(headers),
			},
		});
		expectNoTwoFactorChallenge(response.data);
		expect(response.data.token).toBeDefined();
		const betterAuthCookie = headers.get("set-cookie");
		expect(betterAuthCookie).toBeDefined();
	});

	it("shouldn't verify magic link with the same token", async () => {
		await client.magicLink.verify(
			{
				query: {
					token: new URL(verificationEmail.url).searchParams.get("token") || "",
				},
			},
			{
				onError(context) {
					expect(context.response.status).toBe(302);
					const location = context.response.headers.get("location");
					expect(location).toContain("?error=ATTEMPTS_EXCEEDED");
				},
			},
		);
	});

	it("shouldn't verify magic link with an expired token", async () => {
		await client.signIn.magicLink({
			email: testUser.email,
		});
		const token = verificationEmail.token;
		vi.useFakeTimers();
		await vi.advanceTimersByTimeAsync(1000 * 60 * 5 + 1);
		await client.magicLink.verify(
			{
				query: {
					token,
					callbackURL: "/callback",
				},
			},
			{
				onError(context) {
					expect(context.response.status).toBe(302);
					const location = context.response.headers.get("location");
					expect(location).toContain("?error=EXPIRED_TOKEN");
				},
			},
		);
	});

	it("should redirect to errorCallbackURL in case of error", async () => {
		const errorCallbackURL = new URL("http://localhost:3000/error-page");
		errorCallbackURL.searchParams.set("foo", "bar");
		errorCallbackURL.searchParams.set("baz", "qux");

		await client.magicLink.verify(
			{
				query: {
					token: "invalid-token",
					errorCallbackURL: errorCallbackURL.toString(),
				},
			},
			{
				onError(context) {
					expect(context.response.status).toBe(302);

					const location = context.response.headers.get("location");
					expect(location).toBeDefined();

					const url = new URL(location!);
					expect(url.origin).toBe(errorCallbackURL.origin);
					expect(url.pathname).toBe(errorCallbackURL.pathname);
					expect(url.searchParams.get("foo")).toBe("bar");
					expect(url.searchParams.get("baz")).toBe("qux");
					expect(url.searchParams.get("error")).toBe("INVALID_TOKEN");
				},
			},
		);
	});

	it("should redirect to errorCallbackURL when final session creation fails", async () => {
		const errorCallbackURL = new URL("http://localhost:3000/error-page");
		const context = await auth.$context;
		const originalCreateSession = context.internalAdapter.createSession;
		context.internalAdapter.createSession = vi.fn().mockResolvedValue(null);

		try {
			await client.signIn.magicLink({
				email: testUser.email,
			});

			await client.magicLink.verify(
				{
					query: {
						token:
							new URL(verificationEmail.url).searchParams.get("token") || "",
						errorCallbackURL: errorCallbackURL.toString(),
					},
				},
				{
					onError(context) {
						expect(context.response.status).toBe(302);

						const location = context.response.headers.get("location");
						expect(location).toBeDefined();

						const url = new URL(location!);
						expect(url.origin).toBe(errorCallbackURL.origin);
						expect(url.pathname).toBe(errorCallbackURL.pathname);
						expect(url.searchParams.get("error")).toBe(
							"failed_to_create_session",
						);
					},
				},
			);
		} finally {
			context.internalAdapter.createSession = originalCreateSession;
		}
	});

	it("should sign up with magic link", async () => {
		const email = "new-email@email.com";
		await client.signIn.magicLink({
			email,
			name: "test",
		});
		expect(verificationEmail).toMatchObject({
			email,
			url: expect.stringContaining(
				"http://localhost:3000/api/auth/magic-link/verify",
			),
		});
		const headers = new Headers();
		await client.magicLink.verify({
			query: {
				token: new URL(verificationEmail.url).searchParams.get("token") || "",
			},
			fetchOptions: {
				onSuccess: sessionSetter(headers),
			},
		});
		const session = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(session.data?.user).toMatchObject({
			name: "test",
			email: "new-email@email.com",
			emailVerified: true,
		});
	});

	it("should verify email and return emailVerified true in session for existing unverified user", async () => {
		// Create an unverified user with a separate test instance
		const email = "unverified-user@email.com";
		let magicLinkEmail: VerificationEmail = {
			email: "",
			token: "",
			url: "",
		};

		const {
			auth,
			customFetchImpl: testFetchImpl,
			sessionSetter: testSessionSetter,
		} = await getTestInstance({
			plugins: [
				magicLink({
					async sendMagicLink(data) {
						magicLinkEmail = data;
					},
				}),
			],
		});

		const testClient = createAuthClient({
			plugins: [magicLinkClient()],
			fetchOptions: {
				customFetchImpl: testFetchImpl,
			},
			baseURL: "http://localhost:3000",
			basePath: "/api/auth",
		});

		const internalAdapter = (await auth.$context).internalAdapter;

		// Create user with emailVerified: false
		const newUser = await auth.api.signUpEmail({
			body: {
				email,
				name: "Unverified User",
				password: "password123",
			},
		});

		expect(newUser.user?.emailVerified).toBe(false);

		// Send magic link
		await testClient.signIn.magicLink({
			email,
		});

		// Verify magic link
		const headers = new Headers();
		const response = await testClient.magicLink.verify({
			query: {
				token: new URL(magicLinkEmail.url).searchParams.get("token") || "",
			},
			fetchOptions: {
				onSuccess: testSessionSetter(headers),
			},
		});

		// Check that the response contains emailVerified: true
		expectNoTwoFactorChallenge(response.data);
		expect(response.data.user.emailVerified).toBe(true);

		// Also verify session has emailVerified: true
		const session = await testClient.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(session.data?.user.emailVerified).toBe(true);

		// Verify DB was actually updated
		const updatedUser = await internalAdapter.findUserByEmail(email);
		expect(updatedUser?.user.emailVerified).toBe(true);
	});

	it("should use custom generateToken function", async () => {
		const customGenerateToken = vi.fn(() => "custom_token");

		const { customFetchImpl } = await getTestInstance({
			plugins: [
				magicLink({
					async sendMagicLink(data) {
						verificationEmail = data;
					},
					generateToken: customGenerateToken,
				}),
			],
		});

		const customClient = createAuthClient({
			plugins: [magicLinkClient()],
			fetchOptions: {
				customFetchImpl,
			},
			baseURL: "http://localhost:3000/api/auth",
		});

		await customClient.signIn.magicLink({
			email: testUser.email,
		});

		expect(customGenerateToken).toHaveBeenCalled();
		expect(verificationEmail.token).toBe("custom_token");
	});

	it("should return additional fields", async () => {
		const { customFetchImpl, sessionSetter, auth } = await getTestInstance({
			user: {
				additionalFields: {
					foo: {
						type: "string",
						required: false,
					},
				},
			},
			plugins: [
				magicLink({
					async sendMagicLink(data) {
						verificationEmail = data;
					},
				}),
			],
		});

		const client = createAuthClient({
			plugins: [magicLinkClient()],
			fetchOptions: {
				customFetchImpl,
			},
			baseURL: "http://localhost:3000/api/auth",
		});

		const email = "test-email@test.com";
		await client.signIn.magicLink({
			email,
		});

		const headers = new Headers();
		const response = await client.magicLink.verify({
			query: {
				token: new URL(verificationEmail.url).searchParams.get("token") || "",
			},
			fetchOptions: {
				onSuccess: sessionSetter(headers),
			},
		});

		expectNoTwoFactorChallenge(response.data);
		expect(response.data.user).toBeDefined();
		// @ts-expect-error
		expect(response.data.user.foo).toBeNull();

		await auth.api.updateUser({
			body: {
				foo: "bar",
			},
			headers,
		});

		await client.signIn.magicLink({
			email,
		});
		{
			const response = await client.magicLink.verify({
				query: {
					token: new URL(verificationEmail.url).searchParams.get("token")!,
				},
				fetchOptions: {
					onSuccess: sessionSetter(headers),
				},
			});

			expectNoTwoFactorChallenge(response.data);
			// @ts-expect-error
			expect(response.data.user.foo).toBe("bar");
		}
	});
});

describe("magic link verify", async () => {
	const verificationEmail: VerificationEmail[] = [
		{
			email: "",
			token: "",
			url: "",
		},
	];
	const { customFetchImpl, testUser, sessionSetter } = await getTestInstance({
		plugins: [
			magicLink({
				async sendMagicLink(data) {
					verificationEmail.push(data);
				},
			}),
		],
	});

	const client = createAuthClient({
		plugins: [magicLinkClient()],
		fetchOptions: {
			customFetchImpl,
		},
		baseURL: "http://localhost:3000/api/auth",
	});

	it("should verify last magic link", async () => {
		await client.signIn.magicLink({
			email: testUser.email,
		});
		await client.signIn.magicLink({
			email: testUser.email,
		});
		await client.signIn.magicLink({
			email: testUser.email,
		});
		const headers = new Headers();
		const lastEmail = verificationEmail.pop() as VerificationEmail;
		const response = await client.magicLink.verify({
			query: {
				token: new URL(lastEmail.url).searchParams.get("token") || "",
			},
			fetchOptions: {
				onSuccess: sessionSetter(headers),
			},
		});
		expectNoTwoFactorChallenge(response.data);
		expect(response.data.token).toBeDefined();
		const betterAuthCookie = headers.get("set-cookie");
		expect(betterAuthCookie).toBeDefined();
	});
});

describe("magic link verify origin validation", async () => {
	it("should reject untrusted callbackURL on verify", async () => {
		let verificationEmail: VerificationEmail = {
			email: "",
			token: "",
			url: "",
		};

		const { customFetchImpl, testUser } = await getTestInstance({
			trustedOrigins: ["http://localhost:3000"],
			plugins: [
				magicLink({
					async sendMagicLink(data) {
						verificationEmail = data;
					},
				}),
			],
			advanced: {
				disableOriginCheck: false,
			},
		});

		const client = createAuthClient({
			plugins: [magicLinkClient()],
			fetchOptions: {
				customFetchImpl,
			},
			baseURL: "http://localhost:3000",
			basePath: "/api/auth",
		});

		await client.signIn.magicLink({
			email: testUser.email,
		});

		const token =
			new URL(verificationEmail.url).searchParams.get("token") || "";
		const res = await client.magicLink.verify({
			query: {
				token,
				callbackURL: "http://malicious.com",
			},
		});

		expect(res.error?.status).toBe(403);
		expect(res.error?.message).toBe("Invalid callbackURL");
	});
});

describe("magic link storeToken", async () => {
	it("should store token in hashed", async () => {
		let verificationEmail: VerificationEmail = {
			email: "",
			token: "",
			url: "",
		};
		const { auth, signInWithTestUser, testUser } = await getTestInstance({
			plugins: [
				magicLink({
					storeToken: "hashed",
					sendMagicLink(data, request) {
						verificationEmail = data;
					},
				}),
			],
		});

		const internalAdapter = (await auth.$context).internalAdapter;
		const { headers } = await signInWithTestUser();
		await auth.api.signInMagicLink({
			body: {
				email: testUser.email,
			},
			headers,
		});
		const hashedToken = await defaultKeyHasher(verificationEmail.token);
		const storedToken =
			await internalAdapter.findVerificationValue(hashedToken);
		expect(storedToken).toBeDefined();
		const response2 = await auth.api.signInMagicLink({
			body: {
				email: testUser.email,
			},
			headers,
		});
		expect(response2.status).toBe(true);
	});

	it("should store token with custom hasher", async () => {
		let verificationEmail: VerificationEmail = {
			email: "",
			token: "",
			url: "",
		};
		const { auth, signInWithTestUser, testUser } = await getTestInstance({
			plugins: [
				magicLink({
					storeToken: {
						type: "custom-hasher",
						async hash(token) {
							return token + "hashed";
						},
					},
					sendMagicLink(data, request) {
						verificationEmail = data;
					},
				}),
			],
		});

		const internalAdapter = (await auth.$context).internalAdapter;
		const { headers } = await signInWithTestUser();
		await auth.api.signInMagicLink({
			body: {
				email: testUser.email,
			},
			headers,
		});
		const hashedToken = `${verificationEmail.token}hashed`;
		const storedToken =
			await internalAdapter.findVerificationValue(hashedToken);
		expect(storedToken).toBeDefined();
		const response2 = await auth.api.signInMagicLink({
			body: {
				email: testUser.email,
			},
			headers,
		});
		expect(response2.status).toBe(true);
	});
});

describe("magic link allowedAttempts", async () => {
	it("should reject second verification attempt with default allowedAttempts (1)", async () => {
		let verificationEmail: VerificationEmail = {
			email: "",
			token: "",
			url: "",
		};
		const { customFetchImpl, testUser, sessionSetter } = await getTestInstance({
			plugins: [
				magicLink({
					async sendMagicLink(data) {
						verificationEmail = data;
					},
				}),
			],
		});

		const client = createAuthClient({
			plugins: [magicLinkClient()],
			fetchOptions: {
				customFetchImpl,
			},
			baseURL: "http://localhost:3000",
			basePath: "/api/auth",
		});

		await client.signIn.magicLink({
			email: testUser.email,
		});

		const token =
			new URL(verificationEmail.url).searchParams.get("token") || "";

		// First attempt should succeed
		const headers = new Headers();
		const response = await client.magicLink.verify({
			query: {
				token,
			},
			fetchOptions: {
				onSuccess: sessionSetter(headers),
			},
		});

		expectNoTwoFactorChallenge(response.data);
		expect(response.data.token).toBeDefined();
		const betterAuthCookie = headers.get("set-cookie");
		expect(betterAuthCookie).toBeDefined();

		// Second attempt should be rejected with ATTEMPTS_EXCEEDED
		await client.magicLink.verify(
			{
				query: {
					token,
				},
			},
			{
				onError(context) {
					expect(context.response.status).toBe(302);
					const location = context.response.headers.get("location");
					expect(location).toContain("?error=ATTEMPTS_EXCEEDED");
				},
				onSuccess() {
					throw new Error("Should not succeed");
				},
			},
		);
	});

	it("should respect allowedAttempts value of 3", async () => {
		let verificationEmail: VerificationEmail = {
			email: "",
			token: "",
			url: "",
		};
		const { customFetchImpl, testUser, sessionSetter } = await getTestInstance({
			plugins: [
				magicLink({
					allowedAttempts: 3,
					async sendMagicLink(data) {
						verificationEmail = data;
					},
				}),
			],
		});

		const client = createAuthClient({
			plugins: [magicLinkClient()],
			fetchOptions: {
				customFetchImpl,
			},
			baseURL: "http://localhost:3000",
			basePath: "/api/auth",
		});

		await client.signIn.magicLink({
			email: testUser.email,
		});

		const token =
			new URL(verificationEmail.url).searchParams.get("token") || "";

		// 3 attempts should succeed
		for (let i = 0; i < 3; i++) {
			const headers = new Headers();
			const response = await client.magicLink.verify({
				query: {
					token,
				},
				fetchOptions: {
					onSuccess: sessionSetter(headers),
				},
			});
			expectNoTwoFactorChallenge(response.data);
			expect(response.data.token).toBeDefined();
			const betterAuthCookie = headers.get("set-cookie");
			expect(betterAuthCookie).toBeDefined();
		}

		// Fourth attempt should be rejected with ATTEMPTS_EXCEEDED
		await client.magicLink.verify(
			{
				query: {
					token,
				},
			},
			{
				onError(context) {
					expect(context.response.status).toBe(302);
					const location = context.response.headers.get("location");
					expect(location).toContain("?error=ATTEMPTS_EXCEEDED");
				},
				onSuccess() {
					throw new Error("Should not succeed");
				},
			},
		);
	});

	it("shouldn't verify magic link with an expired token on second attempt", async () => {
		let verificationEmail: VerificationEmail = {
			email: "",
			token: "",
			url: "",
		};
		const { customFetchImpl, testUser, sessionSetter } = await getTestInstance({
			plugins: [
				magicLink({
					allowedAttempts: 3,
					async sendMagicLink(data) {
						verificationEmail = data;
					},
				}),
			],
		});

		const client = createAuthClient({
			plugins: [magicLinkClient()],
			fetchOptions: {
				customFetchImpl,
			},
			baseURL: "http://localhost:3000",
			basePath: "/api/auth",
		});

		await client.signIn.magicLink({
			email: testUser.email,
		});

		const token =
			new URL(verificationEmail.url).searchParams.get("token") || "";

		// 2 attempts should succeed
		for (let i = 0; i < 2; i++) {
			const headers = new Headers();
			const response = await client.magicLink.verify({
				query: {
					token,
				},
				fetchOptions: {
					onSuccess: sessionSetter(headers),
				},
			});
			expectNoTwoFactorChallenge(response.data);
			expect(response.data.token).toBeDefined();
			const betterAuthCookie = headers.get("set-cookie");
			expect(betterAuthCookie).toBeDefined();
		}

		// Third attempt after expiration should be rejected with EXPIRED_TOKEN
		vi.useFakeTimers();
		await vi.advanceTimersByTimeAsync(1000 * 60 * 5 + 1);
		const _response = await client.magicLink.verify(
			{
				query: {
					token,
					callbackURL: "/callback",
				},
			},
			{
				onError(context) {
					expect(context.response.status).toBe(302);
					const location = context.response.headers.get("location");
					expect(location).toContain("?error=EXPIRED_TOKEN");
				},
				onSuccess() {
					throw new Error("Should not succeed");
				},
			},
		);
	});

	it("should respect allowedAttempts value of Infinity", async () => {
		let verificationEmail: VerificationEmail = {
			email: "",
			token: "",
			url: "",
		};
		const { customFetchImpl, testUser, sessionSetter } = await getTestInstance({
			plugins: [
				magicLink({
					allowedAttempts: Infinity,
					async sendMagicLink(data) {
						verificationEmail = data;
					},
				}),
			],
		});

		const client = createAuthClient({
			plugins: [magicLinkClient()],
			fetchOptions: {
				customFetchImpl,
			},
			baseURL: "http://localhost:3000",
			basePath: "/api/auth",
		});

		await client.signIn.magicLink({
			email: testUser.email,
		});

		const token =
			new URL(verificationEmail.url).searchParams.get("token") || "";

		// verify that at least 10 attempts succeed
		for (let i = 0; i < 10; i++) {
			const headers = new Headers();
			const response = await client.magicLink.verify({
				query: {
					token,
				},
				fetchOptions: {
					onSuccess: sessionSetter(headers),
				},
			});
			expectNoTwoFactorChallenge(response.data);
			expect(response.data.token).toBeDefined();
			const betterAuthCookie = headers.get("set-cookie");
			expect(betterAuthCookie).toBeDefined();
		}
	});
});

describe("magic link two-factor challenge", async () => {
	it("should redirect through two-factor for enabled users", async () => {
		let verificationEmail: VerificationEmail = {
			email: "",
			token: "",
			url: "",
		};

		const { auth, db, customFetchImpl } = await getTestInstance(
			{
				plugins: [
					magicLink({
						async sendMagicLink(data) {
							verificationEmail = data;
						},
					}),
					twoFactor({
						otpOptions: {
							async sendOTP() {},
						},
					}),
				],
			},
			{
				disableTestUser: true,
			},
		);
		const client = createAuthClient({
			plugins: [magicLinkClient()],
			fetchOptions: {
				customFetchImpl,
			},
			baseURL: "http://localhost:3000",
			basePath: "/api/auth",
		});

		const context = await auth.$context;
		const existingUser = await context.internalAdapter.createUser({
			email: "magic-2fa@test.com",
			name: "Magic Link User",
			emailVerified: true,
		});
		await db.update({
			model: "user",
			update: {
				twoFactorEnabled: true,
			},
			where: [{ field: "id", value: existingUser.id }],
		});

		await client.signIn.magicLink({
			email: "magic-2fa@test.com",
		});

		const verifyURL = new URL(verificationEmail.url);
		await client.$fetch(`/magic-link/verify${verifyURL.search}`, {
			onError(context) {
				expect(context.response.status).toBe(302);
				const location = context.response.headers.get("location");
				expect(location).toBeDefined();
				const redirectURL = new URL(location!, "http://localhost:3000");
				expect(redirectURL.pathname).toBe("/");
				expect(redirectURL.searchParams.get("challenge")).toBe("two-factor");
				expect(redirectURL.searchParams.get("attemptId")).toBeNull();
				expect(redirectURL.searchParams.get("methods")).toBe("otp");

				const cookies = parseSetCookieHeader(
					context.response.headers.get("set-cookie") || "",
				);
				expect(cookies.get("better-auth.two_factor")?.value).toBeDefined();
			},
		});

		const sessions = await context.internalAdapter.listSessions(
			existingUser.id,
		);
		expect(sessions).toHaveLength(0);
	});

	it("should preserve inherited session_only state after two-factor verification", async () => {
		let verificationEmail: VerificationEmail = {
			email: "",
			token: "",
			url: "",
		};
		let otp = "";

		const { auth, db, customFetchImpl, testUser } = await getTestInstance(
			{
				secret: DEFAULT_SECRET,
				plugins: [
					magicLink({
						async sendMagicLink(data) {
							verificationEmail = data;
						},
					}),
					twoFactor({
						otpOptions: {
							sendOTP({ otp: nextOtp }) {
								otp = nextOtp;
							},
						},
					}),
				],
			},
			{
				disableTestUser: false,
			},
		);

		const client = createAuthClient({
			plugins: [magicLinkClient()],
			fetchOptions: {
				customFetchImpl,
			},
			baseURL: "http://localhost:3000",
			basePath: "/api/auth",
		});

		const existingUser = await auth.$context.then((context) =>
			context.internalAdapter.createUser({
				email: "magic-remember-2fa@test.com",
				name: "Magic Remember Me User",
				emailVerified: true,
			}),
		);
		await db.update({
			model: "user",
			update: {
				twoFactorEnabled: true,
			},
			where: [{ field: "id", value: existingUser.id }],
		});

		const sessionOnlyResponse = await auth.api.signInEmail({
			body: {
				email: testUser.email,
				password: testUser.password,
				rememberMe: false,
			},
			asResponse: true,
		});
		const sessionOnlyCookies = parseSetCookieHeader(
			sessionOnlyResponse.headers.get("set-cookie") || "",
		);
		const sessionOnlyCookie = sessionOnlyCookies.get(
			"better-auth.session_only",
		)?.value;
		expect(sessionOnlyCookie).toBeDefined();

		await client.signIn.magicLink({
			email: existingUser.email,
		});

		const challengeHeaders = new Headers();
		challengeHeaders.set(
			"cookie",
			`better-auth.session_only=${sessionOnlyCookie}`,
		);

		const verifyURL = new URL(verificationEmail.url);
		let challengeCookie = "";
		await client.$fetch(`/magic-link/verify${verifyURL.search}`, {
			headers: challengeHeaders,
			onError(context) {
				const cookies = parseSetCookieHeader(
					context.response.headers.get("set-cookie") || "",
				);
				challengeCookie = cookies.get("better-auth.two_factor")?.value || "";
			},
		});
		expect(challengeCookie).toBeTruthy();
		challengeHeaders.set(
			"cookie",
			`better-auth.session_only=${sessionOnlyCookie}; better-auth.two_factor=${challengeCookie}`,
		);

		await auth.api.sendTwoFactorOTP({
			headers: challengeHeaders,
			body: {},
		});
		expect(otp).toHaveLength(6);

		const verifyResponse = await auth.api.verifyTwoFactorOTP({
			headers: challengeHeaders,
			body: {
				code: otp,
			},
			asResponse: true,
		});
		const cookies = parseSetCookieHeader(
			verifyResponse.headers.get("set-cookie") || "",
		);
		expect(cookies.get("better-auth.session_token")?.value).toBeDefined();
		expect(
			cookies.get("better-auth.session_token")?.["max-age"],
		).not.toBeDefined();
		expect(cookies.get("better-auth.session_only")?.value).toBeDefined();
	});
});
