import { describe, expect, it, vi } from "vitest";
import { createAuthClient } from "../../client";
import { getTestInstance } from "../../test-utils/test-instance";
import { magicLink } from ".";
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
