import { describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { magicLink } from ".";
import { createAuthClient } from "../../client";
import { magicLinkClient } from "./client";
import { defaultKeyHasher } from "./utils";
import type { GenericEndpointContext } from "../../types";

type VerificationEmail = {
	email: string;
	token: string;
	url: string;
};

describe("magic link", async () => {
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
					expect(location).toContain("?error=INVALID_TOKEN");
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
		const response = await client.magicLink.verify({
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

describe("magic link storeToken", async () => {
	it("should store token in hashed", async () => {
		let verificationEmail: VerificationEmail = {
			email: "",
			token: "",
			url: "",
		};
		const { auth, signInWithTestUser, client, testUser } =
			await getTestInstance({
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
		const response = await auth.api.signInMagicLink({
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
		const { auth, signInWithTestUser, client, testUser } =
			await getTestInstance({
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

describe("magic link disableSignUp as function", async () => {
	it("should block signup when function returns true", async () => {
		const disableSignUpFn = vi.fn(() => true);
		const { customFetchImpl } = await getTestInstance({
			plugins: [
				magicLink({
					async sendMagicLink() {},
					disableSignUp: disableSignUpFn,
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

		await client.signIn.magicLink(
			{
				email: "new-user@example.com",
				name: "Test User",
			},
			{
				onError: (context) => {
					expect(context.response.status).toBe(400);
				},
			},
		);

		expect(disableSignUpFn).toHaveBeenCalled();
	});

	it("should allow signup when function returns false", async () => {
		let capturedEmail = "";
		const disableSignUpFn = vi.fn(() => false);
		const { customFetchImpl } = await getTestInstance({
			plugins: [
				magicLink({
					async sendMagicLink(data) {
						capturedEmail = data.email;
					},
					disableSignUp: disableSignUpFn,
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

		const newEmail = "allowed-user@example.com";
		await client.signIn.magicLink({
			email: newEmail,
			name: "Allowed User",
		});

		expect(disableSignUpFn).toHaveBeenCalled();
		expect(capturedEmail).toBe(newEmail);
	});

	it("should receive context in disableSignUp function", async () => {
		const disableSignUpFn = vi.fn((ctx: GenericEndpointContext) => {
			// Check if email is from blocked domain
			return ctx.body.email?.endsWith("@blocked.com") ?? false;
		});

		const { customFetchImpl } = await getTestInstance({
			plugins: [
				magicLink({
					async sendMagicLink() {},
					disableSignUp: disableSignUpFn,
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

		// Test - should succeed since email is not from blocked domain
		await client.signIn.magicLink({
			email: "test-user@example.com",
		});

		expect(disableSignUpFn).toHaveBeenCalled();

		// Verify function received context with body
		const callArg = disableSignUpFn.mock.calls[0]?.[0];
		expect(callArg).toBeDefined();
		expect(callArg?.body).toBeDefined();
		expect(callArg?.body.email).toBe("test-user@example.com");
	});

	it("should handle async disableSignUp function", async () => {
		let wasCalledAsync = false;
		const disableSignUpFn = vi.fn(async (ctx: GenericEndpointContext) => {
			// Simulate async operation
			await Promise.resolve();
			wasCalledAsync = true;
			return true;
		});

		const { customFetchImpl } = await getTestInstance({
			plugins: [
				magicLink({
					async sendMagicLink() {},
					disableSignUp: disableSignUpFn,
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

		await client.signIn.magicLink(
			{
				email: "new-user@example.com",
			},
			{
				onError: (context) => {
					expect(context.response.status).toBe(400);
				},
			},
		);

		expect(disableSignUpFn).toHaveBeenCalled();
		expect(wasCalledAsync).toBe(true);
	});

	it("should not block existing users even when disableSignUp function returns true", async () => {
		let capturedEmail = "";
		const disableSignUpFn = vi.fn(() => true);
		const { customFetchImpl, testUser } = await getTestInstance({
			plugins: [
				magicLink({
					async sendMagicLink(data) {
						capturedEmail = data.email;
					},
					disableSignUp: disableSignUpFn,
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

		// Existing user should be allowed even when disableSignUp returns true
		await client.signIn.magicLink({
			email: testUser.email,
		});

		expect(disableSignUpFn).toHaveBeenCalled();
		expect(capturedEmail).toBe(testUser.email);
	});

	it("should evaluate disableSignUp function during verification flow", async () => {
		let verificationEmail: VerificationEmail = {
			email: "",
			token: "",
			url: "",
		};
		const disableSignUpFn = vi.fn(() => false); // Allow signup
		const { customFetchImpl, sessionSetter } = await getTestInstance({
			plugins: [
				magicLink({
					async sendMagicLink(data) {
						verificationEmail = data;
					},
					disableSignUp: disableSignUpFn,
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

		// Send magic link to new user
		const newEmail = "verification-test@example.com";
		await client.signIn.magicLink({
			email: newEmail,
			name: "Verification Test",
		});

		expect(disableSignUpFn).toHaveBeenCalledTimes(1); // Called during send

		// Verify the magic link - should call function again during verification
		const headers = new Headers();
		await client.magicLink.verify({
			query: {
				token: new URL(verificationEmail.url).searchParams.get("token") || "",
			},
			fetchOptions: {
				onSuccess: sessionSetter(headers),
			},
		});

		// Should be called twice total: once during send, once during verify
		expect(disableSignUpFn).toHaveBeenCalledTimes(2);

		// Verify user was created since function returned false
		const session = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(session.data?.user).toMatchObject({
			email: newEmail,
			name: "Verification Test",
		});
	});
});
