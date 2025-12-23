import { APIError } from "better-call";
import { describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { oneTimeToken } from ".";
import { oneTimeTokenClient } from "./client";
import { defaultKeyHasher } from "./utils";

describe("One-time token", async () => {
	const { auth, signInWithTestUser, client } = await getTestInstance(
		{
			plugins: [oneTimeToken()],
		},
		{
			clientOptions: {
				plugins: [oneTimeTokenClient()],
			},
		},
	);
	it("should work", async () => {
		const { headers } = await signInWithTestUser();
		const response = await auth.api.generateOneTimeToken({
			headers,
		});
		expect(response.token).toBeDefined();
		const session = await auth.api.verifyOneTimeToken({
			body: {
				token: response.token,
			},
		});
		expect(session).toBeDefined();
		const shouldFail = await auth.api
			.verifyOneTimeToken({
				body: {
					token: response.token,
				},
			})
			.catch((e) => e);
		expect(shouldFail).toBeInstanceOf(APIError);
	});

	it("should expire", async () => {
		const { headers } = await signInWithTestUser();
		const response = await auth.api.generateOneTimeToken({
			headers,
		});
		vi.useFakeTimers();
		await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
		const shouldFail = await auth.api
			.verifyOneTimeToken({
				body: {
					token: response.token,
				},
			})
			.catch((e) => e);
		expect(shouldFail).toBeInstanceOf(APIError);
		vi.useRealTimers();
	});

	it("should work with client", async () => {
		const { headers } = await signInWithTestUser();
		const response = await client.oneTimeToken.generate({
			fetchOptions: {
				headers,
				throw: true,
			},
		});
		expect(response.token).toBeDefined();
		const session = await client.oneTimeToken.verify({
			token: response.token,
		});
		expect(session.data?.session).toBeDefined();
	});

	it("should reject token when underlying session has expired", async () => {
		const testInstance = await getTestInstance(
			{
				session: {
					expiresIn: 60,
					updateAge: 0,
				},
				plugins: [oneTimeToken({ expiresIn: 10 })],
			},
			{
				clientOptions: {
					plugins: [oneTimeTokenClient()],
				},
			},
		);

		const { headers } = await testInstance.signInWithTestUser();

		const response = await testInstance.auth.api.generateOneTimeToken({
			headers,
		});
		expect(response.token).toBeDefined();

		vi.useFakeTimers();
		await vi.advanceTimersByTimeAsync(2 * 60 * 1000);

		const shouldFail = await testInstance.auth.api
			.verifyOneTimeToken({
				body: {
					token: response.token,
				},
			})
			.catch((e) => e);

		expect(shouldFail).toBeInstanceOf(APIError);
		expect(shouldFail.body.message).toBe("Session expired");

		vi.useRealTimers();
	});

	describe("should work with different storeToken options", () => {
		describe("hashed", async () => {
			const { auth, signInWithTestUser } = await getTestInstance(
				{
					plugins: [
						oneTimeToken({
							storeToken: "hashed",
							async generateToken(session, ctx) {
								return "123456";
							},
						}),
					],
				},
				{
					clientOptions: {
						plugins: [oneTimeTokenClient()],
					},
				},
			);
			const { internalAdapter } = await auth.$context;

			it("should work with hashed", async () => {
				const { headers } = await signInWithTestUser();
				const response = await auth.api.generateOneTimeToken({
					headers,
				});
				expect(response.token).toBeDefined();
				expect(response.token).toBe("123456");

				const hashedToken = await defaultKeyHasher(response.token);
				const storedToken = await internalAdapter.findVerificationValue(
					`one-time-token:${hashedToken}`,
				);
				expect(storedToken).toBeDefined();

				const session = await auth.api.verifyOneTimeToken({
					body: {
						token: response.token,
					},
				});
				expect(session).toBeDefined();
				expect(session.user.email).toBeDefined();
			});
		});

		describe("custom hasher", async () => {
			const { auth, signInWithTestUser } = await getTestInstance({
				plugins: [
					oneTimeToken({
						storeToken: {
							type: "custom-hasher",
							hash: async (token) => {
								return token + "hashed";
							},
						},
						async generateToken(session, ctx) {
							return "123456";
						},
					}),
				],
			});
			const { internalAdapter } = await auth.$context;
			it("should work with custom hasher", async () => {
				const { headers } = await signInWithTestUser();
				const response = await auth.api.generateOneTimeToken({
					headers,
				});
				expect(response.token).toBeDefined();
				expect(response.token).toBe("123456");

				const hashedToken = response.token + "hashed";
				const storedToken = await internalAdapter.findVerificationValue(
					`one-time-token:${hashedToken}`,
				);
				expect(storedToken).toBeDefined();

				const session = await auth.api.verifyOneTimeToken({
					body: {
						token: response.token,
					},
				});
				expect(session).toBeDefined();
			});
		});
	});

	describe("disableClientRequest option", async () => {
		const { auth, signInWithTestUser, client } = await getTestInstance(
			{
				plugins: [
					oneTimeToken({
						disableClientRequest: true,
					}),
				],
			},
			{
				clientOptions: {
					plugins: [oneTimeTokenClient()],
				},
			},
		);

		it("should allow server-side requests", async () => {
			const { headers } = await signInWithTestUser();
			const response = await auth.api.generateOneTimeToken({
				headers,
			});
			expect(response.token).toBeDefined();
		});

		it("should reject client requests when disableClientRequest is true", async () => {
			const { headers } = await signInWithTestUser();
			const shouldFail = await client.oneTimeToken.generate({
				fetchOptions: {
					headers,
				},
			});
			expect(shouldFail.error?.message).toBe("Client requests are disabled");
		});
	});

	describe("disableSetSessionCookie option", async () => {
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [
				oneTimeToken({
					disableSetSessionCookie: true,
				}),
			],
		});

		it("should not set session cookie when disableSetSessionCookie is true", async () => {
			const { headers } = await signInWithTestUser();
			const response = await auth.api.generateOneTimeToken({
				headers,
			});
			expect(response.token).toBeDefined();

			const verifyResponse = await auth.api.verifyOneTimeToken({
				body: {
					token: response.token,
				},
				asResponse: true,
			});

			const setCookieHeader = verifyResponse.headers.get("set-cookie");
			expect(setCookieHeader).toBeNull();
		});

		it("should set session cookie by default", async () => {
			const defaultInstance = await getTestInstance({
				plugins: [oneTimeToken()],
			});

			const { headers } = await defaultInstance.signInWithTestUser();
			const response = await defaultInstance.auth.api.generateOneTimeToken({
				headers,
			});

			const verifyResponse = await defaultInstance.auth.api.verifyOneTimeToken({
				body: {
					token: response.token,
				},
				asResponse: true,
			});

			const setCookieHeader = verifyResponse.headers.get("set-cookie");
			expect(setCookieHeader).toBeDefined();
			expect(setCookieHeader).toContain("better-auth.session_token");
		});
	});

	describe("setOttHeaderOnNewSession option", async () => {
		it("should set OTT header on new session when enabled", async () => {
			const testInstance = await getTestInstance({
				plugins: [
					oneTimeToken({
						setOttHeaderOnNewSession: true,
					}),
				],
			});

			const response = await testInstance.auth.api.signUpEmail({
				body: {
					email: "ott-header-test@test.com",
					password: "password123",
					name: "OTT Header Test",
				},
				asResponse: true,
			});

			const ottHeader = response.headers.get("set-ott");
			expect(ottHeader).toBeDefined();
			expect(ottHeader).toHaveLength(32);

			const exposeHeaders = response.headers.get(
				"access-control-expose-headers",
			);
			expect(exposeHeaders).toContain("set-ott");
		});

		it("should not set OTT header on new session by default", async () => {
			const testInstance = await getTestInstance({
				plugins: [oneTimeToken()],
			});

			const response = await testInstance.auth.api.signUpEmail({
				body: {
					email: "ott-header-test-default@test.com",
					password: "password123",
					name: "OTT Header Test Default",
				},
				asResponse: true,
			});

			const ottHeader = response.headers.get("set-ott");
			expect(ottHeader).toBeNull();
		});

		it("should set OTT header on sign in when enabled", async () => {
			const testInstance = await getTestInstance({
				plugins: [
					oneTimeToken({
						setOttHeaderOnNewSession: true,
					}),
				],
			});

			// First create a user
			await testInstance.auth.api.signUpEmail({
				body: {
					email: "ott-signin-test@test.com",
					password: "password123",
					name: "OTT SignIn Test",
				},
			});

			// Then sign in
			const response = await testInstance.auth.api.signInEmail({
				body: {
					email: "ott-signin-test@test.com",
					password: "password123",
				},
				asResponse: true,
			});

			const ottHeader = response.headers.get("set-ott");
			expect(ottHeader).toBeDefined();
			expect(ottHeader).toHaveLength(32);
		});
	});
});
