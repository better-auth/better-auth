import { describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { magicLink } from ".";
import { createAuthClient } from "../../client";
import { magicLinkClient } from "./client";
import { defaultKeyHasher } from "./utils";

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