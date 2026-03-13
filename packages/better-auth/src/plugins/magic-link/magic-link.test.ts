import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { createAuthClient } from "../../client";
import { getTestInstance } from "../../test-utils/test-instance";
import { lastLoginMethod } from "../last-login-method";
import { openAPI } from "../open-api";
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

	it("should keep signInMagicLink status-only on the server api", async () => {
		const response = await auth.api.signInMagicLink({
			body: {
				email: testUser.email,
				metadata: {
					inviteId: "server",
				},
			},
			headers: new Headers(),
		});

		expectTypeOf(response).toEqualTypeOf<{
			status: true;
		}>();
		expect(response).toEqual({
			status: true,
		});
		expect(verificationEmail.metadata).toEqual({
			inviteId: "server",
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
		expect(response.data?.token).toBeDefined();
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
		expect(response.data?.user.emailVerified).toBe(true);

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
});

describe("magic link generate", async () => {
	let verificationEmail: VerificationEmail = {
		email: "",
		token: "",
		url: "",
	};
	const sendMagicLink = vi.fn((data: VerificationEmail) => {
		verificationEmail = data;
	});
	const { auth, customFetchImpl, testUser } = await getTestInstance({
		plugins: [
			magicLink({
				sendMagicLink,
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

	it("should expose generateMagicLink on the server api only", async () => {
		expectTypeOf<typeof auth.api>().toHaveProperty("generateMagicLink");
		expectTypeOf<typeof client>().not.toHaveProperty("generateMagicLink");
	});

	it("should issue a magic link without sending it", async () => {
		const response = await auth.api.generateMagicLink({
			body: {
				email: testUser.email,
			},
			headers: new Headers(),
		});

		expectTypeOf<typeof response>().toMatchObjectType<{
			status: true;
			url: string;
			token: string;
		}>();
		expect(response.status).toBe(true);
		expect(new URL(response.url).searchParams.get("token")).toBe(
			response.token,
		);
		expect(sendMagicLink).not.toHaveBeenCalled();
		expect(verificationEmail).toEqual({
			email: "",
			token: "",
			url: "",
		});
	});

	it("should respect callback urls", async () => {
		const response = await auth.api.generateMagicLink({
			body: {
				email: testUser.email,
				callbackURL: "/dashboard",
				newUserCallbackURL: "/welcome",
				errorCallbackURL: "/error",
			},
			headers: new Headers(),
		});

		const url = new URL(response.url);
		expect(url.searchParams.get("callbackURL")).toBe("/dashboard");
		expect(url.searchParams.get("newUserCallbackURL")).toBe("/welcome");
		expect(url.searchParams.get("errorCallbackURL")).toBe("/error");
		expect(sendMagicLink).not.toHaveBeenCalled();
	});

	it("should allow generateMagicLink with lastLoginMethod installed", async () => {
		const { auth, testUser } = await getTestInstance({
			plugins: [
				magicLink({
					sendMagicLink,
				}),
				lastLoginMethod(),
			],
		});

		await expect(
			auth.api.generateMagicLink({
				body: {
					email: testUser.email,
				},
				headers: new Headers(),
			}),
		).resolves.toMatchObject({
			status: true,
		});
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
		expect(response.data?.token).toBeDefined();
		const betterAuthCookie = headers.get("set-cookie");
		expect(betterAuthCookie).toBeDefined();
	});
});

describe("magic link openapi", async () => {
	const { auth } = await getTestInstance({
		plugins: [
			magicLink({
				async sendMagicLink() {},
			}),
			openAPI(),
		],
	});

	it("should keep the public sign-in response schema token-free", async () => {
		const schema = await auth.api.generateOpenAPISchema();
		const paths = schema.paths as Record<string, any>;
		const responseSchema =
			paths["/sign-in/magic-link"].post.responses["200"].content[
				"application/json"
			].schema;

		expect(responseSchema.properties.status).toEqual({
			type: "boolean",
		});
		expect(responseSchema.properties.url).toBeUndefined();
		expect(responseSchema.properties.token).toBeUndefined();
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

	it("should store generated token in hashed storage without sending", async () => {
		const sendMagicLink = vi.fn();
		const { auth, testUser } = await getTestInstance({
			plugins: [
				magicLink({
					storeToken: "hashed",
					sendMagicLink,
				}),
			],
		});

		const internalAdapter = (await auth.$context).internalAdapter;
		const response = await auth.api.generateMagicLink({
			body: {
				email: testUser.email,
			},
			headers: new Headers(),
		});
		const hashedToken = await defaultKeyHasher(response.token);
		const storedToken =
			await internalAdapter.findVerificationValue(hashedToken);

		expect(storedToken).toBeDefined();
		expect(sendMagicLink).not.toHaveBeenCalled();
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

	it("should store generated token with custom hasher without sending", async () => {
		const sendMagicLink = vi.fn();
		const { auth, testUser } = await getTestInstance({
			plugins: [
				magicLink({
					storeToken: {
						type: "custom-hasher",
						async hash(token) {
							return token + "hashed";
						},
					},
					sendMagicLink,
				}),
			],
		});

		const internalAdapter = (await auth.$context).internalAdapter;
		const response = await auth.api.generateMagicLink({
			body: {
				email: testUser.email,
			},
			headers: new Headers(),
		});
		const hashedToken = `${response.token}hashed`;
		const storedToken =
			await internalAdapter.findVerificationValue(hashedToken);

		expect(storedToken).toBeDefined();
		expect(sendMagicLink).not.toHaveBeenCalled();
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

		expect(response.data?.token).toBeDefined();
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
			expect(response.data?.token).toBeDefined();
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
			expect(response.data?.token).toBeDefined();
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
			expect(response.data?.token).toBeDefined();
			const betterAuthCookie = headers.get("set-cookie");
			expect(betterAuthCookie).toBeDefined();
		}
	});
});
