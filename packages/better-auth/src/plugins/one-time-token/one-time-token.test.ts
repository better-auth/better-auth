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

	describe("should work with different storeToken options", () => {
		describe("hashed", async () => {
			const { auth, signInWithTestUser, client } = await getTestInstance(
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
			const { auth, signInWithTestUser, client } = await getTestInstance({
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
});
