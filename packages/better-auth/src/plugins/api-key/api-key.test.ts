import { describe, expect, it } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { apiKey, ERROR_CODES } from ".";
import { apiKeyClient } from "./client";
import type { ApiKey } from "./types";

describe("api-key", async () => {
	const { client, auth, signInWithTestUser } = await getTestInstance(
		{
			plugins: [
				apiKey({
					events({ event, success, user, apiKey, error }) {
						// if (!success) {
						// 	console.log({
						// 		event,
						// 		success,
						// 		user,
						// 		apiKey,
						// 		error,
						// 	});
						// }
					},
					enableMetadata: true,
				}),
			],
		},
		{
			clientOptions: {
				plugins: [apiKeyClient()],
			},
		},
	);
	const { headers, user } = await signInWithTestUser();

	// =========================================================================
	// CREATE API KEY
	// =========================================================================

	it("should fail to create API keys from client without headers", async () => {
		const apiKeyFail = await client.apiKey.create();

		expect(apiKeyFail.data).toBeNull();
		expect(apiKeyFail.error).toBeDefined();
		expect(apiKeyFail.error?.status).toEqual(401);
		expect(apiKeyFail.error?.statusText).toEqual("UNAUTHORIZED");
		expect(apiKeyFail.error?.message).toEqual(ERROR_CODES.UNAUTHORIZED_SESSION);
	});

	let firstApiKey: ApiKey;

	it("should successfully create API keys from client with headers", async () => {
		const apiKey = await client.apiKey.create({}, { headers: headers });
		if (apiKey.data) {
			firstApiKey = apiKey.data;
		}

		expect(apiKey.data).not.toBeNull();
		expect(apiKey.data?.key).toBeDefined();
		expect(apiKey.data?.userId).toEqual(user.id);
		expect(apiKey.data?.name).toBeNull();
		expect(apiKey.data?.prefix).toBeNull();
		expect(apiKey.data?.refillInterval).toBeNull();
		expect(apiKey.data?.refillAmount).toBeNull();
		expect(apiKey.data?.lastRefillAt).toBeNull();
		expect(apiKey.data?.enabled).toEqual(true);
		expect(apiKey.data?.rateLimitTimeWindow).toEqual(86400000);
		expect(apiKey.data?.rateLimitMax).toEqual(10);
		expect(apiKey.data?.requestCount).toEqual(0);
		expect(apiKey.data?.remaining).toBeNull();
		expect(apiKey.data?.lastRequest).toBeNull();
		expect(apiKey.data?.expiresAt).toBeNull();
		expect(apiKey.data?.createdAt).toBeDefined();
		expect(apiKey.data?.updatedAt).toBeDefined();
		expect(apiKey.data?.metadata).toBeNull();
		expect(apiKey.error).toBeNull();
	});

	interface Err {
		body: {
			code: string | undefined;
			message: string | undefined;
		};
		status: string;
		statusCode: string;
	}

	it("should fail to create API Keys from server without headers", async () => {
		let res: { data: ApiKey | null; error: Err | null } = {
			data: null,
			error: null,
		};
		try {
			const apiKey = await auth.api.createApiKey({ body: {} });
			res.data = apiKey;
		} catch (error: any) {
			res.error = error;
		}

		expect(res.data).toBeNull();
		expect(res.error).toBeDefined();
		expect(res.error?.statusCode).toEqual(401);
		expect(res.error?.status).toEqual("UNAUTHORIZED");
		expect(res.error?.body.message).toEqual(ERROR_CODES.UNAUTHORIZED_SESSION);
	});

	it("should successfully create API keys from server with headers", async () => {
		const apiKey = await auth.api.createApiKey({
			body: {},
			headers,
		});

		expect(apiKey).not.toBeNull();
		expect(apiKey.key).toBeDefined();
		expect(apiKey.userId).toEqual(user.id);
		expect(apiKey.name).toBeNull();
		expect(apiKey.prefix).toBeNull();
		expect(apiKey.refillInterval).toBeNull();
		expect(apiKey.refillAmount).toBeNull();
		expect(apiKey.lastRefillAt).toBeNull();
		expect(apiKey.enabled).toEqual(true);
		expect(apiKey.rateLimitTimeWindow).toEqual(86400000);
		expect(apiKey.rateLimitMax).toEqual(10);
		expect(apiKey.requestCount).toEqual(0);
		expect(apiKey.remaining).toBeNull();
		expect(apiKey.lastRequest).toBeNull();
	});

	it("should create the API key with the given name", async () => {
		const apiKey = await auth.api.createApiKey({
			body: {
				name: "test-api-key",
			},
			headers,
		});

		expect(apiKey).not.toBeNull();
		expect(apiKey.name).toEqual("test-api-key");
	});

	it("should create the API key with a name that's shorter than the allowed minimum", async () => {
		let result: { data: ApiKey | null; error: Err | null } = {
			data: null,
			error: null,
		};
		try {
			const apiKey = await auth.api.createApiKey({
				body: {
					name: "test-api-key-that-is-shorter-than-the-allowed-minimum",
				},
				headers,
			});
			result.data = apiKey;
		} catch (error: any) {
			result.error = error;
		}
		expect(result.data).toBeNull();
		expect(result.error).toBeDefined();
		expect(result.error?.status).toEqual("BAD_REQUEST");
		expect(result.error?.body.message).toEqual(ERROR_CODES.INVALID_NAME_LENGTH);
	});

	it("should create the API key with a name that's longer than the allowed maximum", async () => {
		let result: { data: ApiKey | null; error: Err | null } = {
			data: null,
			error: null,
		};
		try {
			const apiKey = await auth.api.createApiKey({
				body: {
					name: "test-api-key-that-is-longer-than-the-allowed-maximum",
				},
				headers,
			});
			result.data = apiKey;
		} catch (error: any) {
			result.error = error;
		}
		expect(result.data).toBeNull();
		expect(result.error).toBeDefined();
		expect(result.error?.status).toEqual("BAD_REQUEST");
		expect(result.error?.body.message).toEqual(ERROR_CODES.INVALID_NAME_LENGTH);
	});

	it("should create the API key with the given prefix", async () => {
		const prefix = "test-api-key_";
		const apiKey = await auth.api.createApiKey({
			body: {
				prefix: prefix,
			},
			headers,
		});

		expect(apiKey).not.toBeNull();
		expect(apiKey.prefix).toEqual(prefix);
		expect(apiKey.key.startsWith(prefix)).toEqual(true);
	});

	it("should create the API key with a prefix that's shorter than the allowed minimum", async () => {
		let result: { data: ApiKey | null; error: Err | null } = {
			data: null,
			error: null,
		};
		try {
			const apiKey = await auth.api.createApiKey({
				body: {
					prefix: "test-api-key-that-is-shorter-than-the-allowed-minimum",
				},
				headers,
			});
			result.data = apiKey;
		} catch (error: any) {
			result.error = error;
		}
		expect(result.data).toBeNull();
		expect(result.error).toBeDefined();
		expect(result.error?.status).toEqual("BAD_REQUEST");
		expect(result.error?.body.message).toEqual(
			ERROR_CODES.INVALID_PREFIX_LENGTH,
		);
	});

	it("should create the API key with a prefix that's longer than the allowed maximum", async () => {
		let result: { data: ApiKey | null; error: Err | null } = {
			data: null,
			error: null,
		};
		try {
			const apiKey = await auth.api.createApiKey({
				body: {
					prefix: "test-api-key-that-is-longer-than-the-allowed-maximum",
				},
				headers,
			});
			result.data = apiKey;
		} catch (error: any) {
			result.error = error;
		}
		expect(result.data).toBeNull();
		expect(result.error).toBeDefined();
		expect(result.error?.status).toEqual("BAD_REQUEST");
		expect(result.error?.body.message).toEqual(
			ERROR_CODES.INVALID_PREFIX_LENGTH,
		);
	});

	it("should create an API key with a custom expiresIn", async () => {
		const expiresIn = 1000 * 60 * 60 * 24 * 7; // 7 days
		const expectedResult = new Date().getTime() + expiresIn;
		const apiKey = await auth.api.createApiKey({
			body: {
				expiresIn: expiresIn,
			},
			headers,
		});
		expect(apiKey).not.toBeNull();
		expect(apiKey.expiresAt).toBeDefined();
		expect(apiKey.expiresAt?.getTime()).toBeGreaterThanOrEqual(expectedResult);
	});

	it("should fail to create a key with a custom expiresIn value when customExpiresTime is disabled", async () => {
		const { client, auth, signInWithTestUser } = await getTestInstance(
			{
				plugins: [
					apiKey({
						enableMetadata: true,
						keyExpiration: {
							disableCustomExpiresTime: true,
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [apiKeyClient()],
				},
			},
		);

		const { headers, user } = await signInWithTestUser();
		let result: { data: ApiKey | null; error: Err | null } = {
			data: null,
			error: null,
		};
		try {
			const apiKey2 = await auth.api.createApiKey({
				body: {
					expiresIn: 10000,
				},
				headers,
			});
			result.data = apiKey2;
		} catch (error: any) {
			result.error = error;
		}

		expect(result.data).toBeNull();
		expect(result.error).toBeDefined();
		expect(result.error?.body.message).toEqual(
			ERROR_CODES.KEY_DISABLED_EXPIRATION,
		);
	});

	it("should create an API key with an expiresIn that's smaller than the allowed minimum", async () => {
		let result: { data: ApiKey | null; error: Err | null } = {
			data: null,
			error: null,
		};
		try {
			const expiresIn = 1000 * 60 * 60 * 24 * 0.5; // half a day
			const apiKey = await auth.api.createApiKey({
				body: {
					expiresIn: expiresIn,
				},
				headers,
			});
			result.data = apiKey;
		} catch (error: any) {
			result.error = error;
		}
		expect(result.data).toBeNull();
		expect(result.error).toBeDefined();
		expect(result.error?.status).toEqual("BAD_REQUEST");
		expect(result.error?.body.message).toEqual(
			ERROR_CODES.EXPIRES_IN_IS_TOO_SMALL,
		);
	});

	it("should fail to create an API key with an expiresIn that's larger than the allowed maximum", async () => {
		let result: { data: ApiKey | null; error: Err | null } = {
			data: null,
			error: null,
		};
		try {
			const expiresIn = 1000 * 60 * 60 * 24 * 365 * 10; // 10 year
			const apiKey = await auth.api.createApiKey({
				body: {
					expiresIn: expiresIn,
				},
				headers,
			});
			result.data = apiKey;
		} catch (error: any) {
			result.error = error;
		}
		expect(result.data).toBeNull();
		expect(result.error).toBeDefined();
		expect(result.error?.status).toEqual("BAD_REQUEST");
		expect(result.error?.body.message).toEqual(
			ERROR_CODES.EXPIRES_IN_IS_TOO_LARGE,
		);
	});

	it("should fail to create API key when refill interval is provided, but no refill amount", async () => {
		let res: { data: ApiKey | null; error: Err | null } = {
			data: null,
			error: null,
		};
		try {
			const apiKey = await auth.api.createApiKey({
				body: {
					refillInterval: 1000,
				},
				headers,
			});
			res.data = apiKey;
		} catch (error: any) {
			res.error = error;
		}

		expect(res.data).toBeNull();
		expect(res.error).toBeDefined();
		expect(res.error?.status).toEqual("BAD_REQUEST");
		expect(res.error?.body.message).toEqual(
			ERROR_CODES.REFILL_INTERVAL_AND_AMOUNT_REQUIRED,
		);
	});

	it("should fail to create API key when refill amount is provided, but no refill interval", async () => {
		let res: { data: ApiKey | null; error: Err | null } = {
			data: null,
			error: null,
		};
		try {
			const apiKey = await auth.api.createApiKey({
				body: {
					refillAmount: 10,
				},
				headers,
			});
			res.data = apiKey;
		} catch (error: any) {
			res.error = error;
		}

		expect(res.data).toBeNull();
		expect(res.error).toBeDefined();
		expect(res.error?.status).toEqual("BAD_REQUEST");
		expect(res.error?.body.message).toEqual(
			ERROR_CODES.REFILL_AMOUNT_AND_INTERVAL_REQUIRED,
		);
	});

	it("should create the API key with the given refill interval & refill amount", async () => {
		const refillInterval = 10000;
		const refillAmount = 10;
		const apiKey = await auth.api.createApiKey({
			body: {
				refillInterval: refillInterval,
				refillAmount: refillAmount,
			},
			headers,
		});

		expect(apiKey).not.toBeNull();
		expect(apiKey.refillInterval).toEqual(refillInterval);
		expect(apiKey.refillAmount).toEqual(refillAmount);
	});

	it("should create API Key with custom remaining", async () => {
		const remaining = 10;
		const apiKey = await auth.api.createApiKey({
			body: {
				remaining: remaining,
			},
			headers,
		});

		expect(apiKey).not.toBeNull();
		expect(apiKey.remaining).toEqual(remaining);
	});

	it("should create API Key with custom remaining that's smaller than allowed minimum", async () => {
		let result: { data: ApiKey | null; error: Err | null } = {
			data: null,
			error: null,
		};
		try {
			const remaining = 0;
			const apiKey = await auth.api.createApiKey({
				body: {
					remaining: remaining,
				},
				headers,
			});
			result.data = apiKey;
		} catch (error: any) {
			result.error = error;
		}
		expect(result.data).toBeNull();
		expect(result.error).toBeDefined();
		expect(result.error?.status).toEqual("BAD_REQUEST");
		expect(result.error?.body.message).toEqual(ERROR_CODES.INVALID_REMAINING);
	});

	it("should create API Key with custom remaining that's larger than allowed maximum", async () => {
		let result: { data: ApiKey | null; error: Err | null } = {
			data: null,
			error: null,
		};
		try {
			const remaining = Number.MAX_SAFE_INTEGER;
			const apiKey = await auth.api.createApiKey({
				body: {
					remaining: remaining,
				},
				headers,
			});
			result.data = apiKey;
		} catch (error: any) {
			result.error = error;
		}
		expect(result.data).toBeNull();
		expect(result.error).toBeDefined();
		expect(result.error?.status).toEqual("BAD_REQUEST");
		expect(result.error?.body.message).toEqual(ERROR_CODES.INVALID_REMAINING);
	});

	it("should create API key with invalid metadata", async () => {
		let result: { data: ApiKey | null; error: Err | null } = {
			data: null,
			error: null,
		};
		try {
			const apiKey = await auth.api.createApiKey({
				body: {
					metadata: "invalid",
				},
				headers,
			});
			result.data = apiKey;
		} catch (error: any) {
			result.error = error;
		}
		expect(result.data).toBeNull();
		expect(result.error).toBeDefined();
		expect(result.error?.status).toEqual("BAD_REQUEST");
		expect(result.error?.body.message).toEqual(
			ERROR_CODES.INVALID_METADATA_TYPE,
		);
	});

	it("should create API key with valid metadata", async () => {
		const metadata = {
			test: "test",
		};
		const apiKey = await auth.api.createApiKey({
			body: {
				metadata: metadata,
			},
			headers,
		});

		expect(apiKey).not.toBeNull();
		expect(apiKey.metadata).toEqual(metadata);
	});

	it("create API key's returned metadata should be an object", async () => {
		const metadata = {
			test: "test-123",
		};
		const apiKey = await auth.api.createApiKey({
			body: {
				metadata: metadata,
			},
			headers,
		});

		expect(apiKey).not.toBeNull();
		expect(apiKey.metadata.test).toBeDefined();
		expect(apiKey.metadata.test).toEqual(metadata.test);
	});

	it("create api key with with metadata when metadata is disabled (should fail)", async () => {
		const { client, auth, signInWithTestUser } = await getTestInstance(
			{
				plugins: [
					apiKey({
						enableMetadata: false,
					}),
				],
			},
			{
				clientOptions: {
					plugins: [apiKeyClient()],
				},
			},
		);
		const { headers } = await signInWithTestUser();

		const metadata = {
			test: "test-123",
		};
		const result: { data: ApiKey | null; error: Err | null } = {
			data: null,
			error: null,
		};
		try {
			const apiKey = await auth.api.createApiKey({
				body: {
					metadata: metadata,
				},
				headers,
			});
			result.data = apiKey;
		} catch (error: any) {
			result.error = error;
		}

		expect(result.data).toBeNull();
		expect(result.error).toBeDefined();
		expect(result.error?.status).toEqual("BAD_REQUEST");
		expect(result.error?.body.message).toEqual(ERROR_CODES.METADATA_DISABLED);
	});

	// =========================================================================
	// VERIFY API KEY
	// =========================================================================

	it("verify api key without headers (should fail)", async () => {
		const result: {
			data: {
				valid: boolean;
				key: Partial<ApiKey>;
			} | null;
			error: Err | null;
		} = {
			data: null,
			error: null,
		};
		try {
			const apiKey = await auth.api.verifyApiKey({
				body: {
					key: firstApiKey.key,
				},
			});
			result.data = apiKey;
		} catch (error: any) {
			result.error = error;
		}

		expect(result.data).toBeNull();
		expect(result.error).toBeDefined();
		expect(result.error?.status).toEqual("UNAUTHORIZED");
		expect(result.error?.body.message).toEqual(
			ERROR_CODES.UNAUTHORIZED_SESSION,
		);
	});

	it("verify api key with headers", async () => {
		const apiKey = await auth.api.verifyApiKey({
			body: {
				key: firstApiKey.key,
			},
			headers,
		});

		expect(apiKey).not.toBeNull();
		expect(apiKey.valid).toEqual(true);
		expect(apiKey.key).toBeDefined();
		expect(apiKey.key.id).toEqual(firstApiKey.id);
	});

	it("verify api key with invalid key (should fail)", async () => {
		let result: {
			data: {
				valid: boolean;
				key: Partial<ApiKey>;
			} | null;
			error: Err | null;
		} = {
			data: null,
			error: null,
		};
		try {
			const apiKey = await auth.api.verifyApiKey({
				body: {
					key: "invalid",
				},
				headers,
			});
			result.data = apiKey;
		} catch (error: any) {
			result.error = error;
		}
		expect(result.data).toBeNull();
		expect(result.error).toBeDefined();
		expect(result.error?.status).toEqual("NOT_FOUND");
		expect(result.error?.body.message).toEqual(ERROR_CODES.KEY_NOT_FOUND);
	});

	let rateLimitedApiKey: ApiKey;

	const {
		client: rateLimitClient,
		auth: rateLimitAuth,
		signInWithTestUser: rateLimitTestUser,
	} = await getTestInstance(
		{
			plugins: [
				apiKey({
					rateLimit: {
						enabled: true,
						timeWindow: 1000,
					},
				}),
			],
		},
		{
			clientOptions: {
				plugins: [apiKeyClient()],
			},
		},
	);

	const { headers: rateLimitUserHeaders } = await rateLimitTestUser();
	it("should fail to verify api key 20 times in a row due to rate-limit", async () => {
		const { data: apiKey2 } = await rateLimitClient.apiKey.create(
			{},
			{ headers: rateLimitUserHeaders },
		);

		if (!apiKey2) return;
		rateLimitedApiKey = apiKey2;

		for (let i = 0; i < 20; i++) {
			let result: {
				data: { valid: boolean; key: Partial<ApiKey> } | null;
				error: Err | null;
			} = {
				data: null,
				error: null,
			};
			try {
				const response = await rateLimitAuth.api.verifyApiKey({
					body: {
						key: apiKey2.key,
					},
					headers: rateLimitUserHeaders,
				});
				result.data = response;
			} catch (error: any) {
				result.error = error;
			}
			// console.log(i, result);

			if (i >= 10) {
				expect(result.error?.status).toEqual("FORBIDDEN");
				expect(result.error?.body.message).toEqual(
					ERROR_CODES.RATE_LIMIT_EXCEEDED,
				);
			} else {
				expect(result.error).toBeNull();
			}
		}
	});

	it("should allow us to verify api key after rate-limit window has passed", async () => {
		await new Promise((resolve) => setTimeout(resolve, 1000));
		let result: {
			data: { valid: boolean; key: Partial<ApiKey> } | null;
			error: Err | null;
		} = {
			data: null,
			error: null,
		};
		try {
			const response = await rateLimitAuth.api.verifyApiKey({
				body: {
					key: rateLimitedApiKey.key,
				},
				headers: rateLimitUserHeaders,
			});
			result.data = response;
		} catch (error: any) {
			result.error = error;
		}
		// console.log(result);
		expect(result.error).toBeNull();
		expect(result.data?.valid).toBe(true);
	});

	it("should check if verifying an api key's remaining count does go down", async () => {
		const remaining = 10;
		const { data: apiKey } = await client.apiKey.create(
			{
				remaining: remaining,
			},
			{ headers: headers },
		);
		if (!apiKey) return;
		const afterVerificationOnce = await auth.api.verifyApiKey({
			body: {
				key: apiKey.key,
			},
			headers,
		});
		expect(afterVerificationOnce?.valid).toEqual(true);
		expect(afterVerificationOnce?.key.remaining).toEqual(remaining - 1);
		const afterVerificationTwice = await auth.api.verifyApiKey({
			body: {
				key: apiKey.key,
			},
			headers,
		});
		expect(afterVerificationTwice?.valid).toEqual(true);
		expect(afterVerificationTwice?.key.remaining).toEqual(remaining - 2);
	});

	it("should fail if the api key has no remaining", async () => {
		const { data: apiKey } = await client.apiKey.create(
			{
				remaining: 1,
			},
			{ headers: headers },
		);
		if (!apiKey) return;
		// run verify once to make the remaining count go down to 0
		await auth.api.verifyApiKey({
			body: {
				key: apiKey.key,
			},
			headers,
		});
		let result: {
			data: { valid: boolean; key: Partial<ApiKey> } | null;
			error: Err | null;
		} = {
			data: null,
			error: null,
		};
		try {
			const afterVerification = await auth.api.verifyApiKey({
				body: {
					key: apiKey.key,
				},
				headers,
			});
			result.data = afterVerification;
		} catch (error: any) {
			result.error = error;
		}
		expect(result.error?.status).toEqual("FORBIDDEN");
		expect(result.error?.body.message).toEqual(ERROR_CODES.KEY_EXPIRED);
	});

	it("should fail if the api key is expired", async () => {
		const { client, auth, signInWithTestUser } = await getTestInstance(
			{
				plugins: [
					apiKey({
						keyExpiration: {
							minExpiresIn: 1,
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [apiKeyClient()],
				},
			},
		);
		const { headers } = await signInWithTestUser();

		const { data: apiKey2 } = await client.apiKey.create(
			{
				expiresIn: 100,
			},
			{ headers: headers },
		);

		if (!apiKey2) return;

		await new Promise((resolve) => setTimeout(resolve, 1000));

		let result: {
			data: { valid: boolean; key: Partial<ApiKey> } | null;
			error: Err | null;
		} = {
			data: null,
			error: null,
		};
		try {
			const afterVerification = await auth.api.verifyApiKey({
				body: {
					key: apiKey2.key,
				},
				headers,
			});
			result.data = afterVerification;
		} catch (error: any) {
			result.error = error;
		}
		expect(result.error?.status).toEqual("FORBIDDEN");
		expect(result.error?.body.message).toEqual(ERROR_CODES.KEY_DISABLED);
	});

	// =========================================================================
	// UPDATE API KEY
	// =========================================================================

	it("should fail to update api key name without headers", async () => {
		let result: { err: Err | null; data: Partial<ApiKey> | null } = {
			data: null,
			err: null,
		};

		try {
			const apiKey = await auth.api.updateApiKey({
				body: {
					keyId: firstApiKey.id,
					name: "test-api-key-that-is-longer-than-the-allowed-maximum",
				},
			});
			result.data = apiKey;
		} catch (error: any) {
			result.err = error;
		}

		expect(result.err).toBeDefined();
		expect(result.err?.status).toEqual("UNAUTHORIZED");
		expect(result.err?.body.message).toEqual(ERROR_CODES.UNAUTHORIZED_SESSION);
	});

	it("should update api key name with headers", async () => {
		const newName = "Hello World";
		const apiKey = await auth.api.updateApiKey({
			body: {
				keyId: firstApiKey.id,
				name: newName,
			},
			headers,
		});

		expect(apiKey).toBeDefined();
		expect(apiKey.name).not.toEqual(firstApiKey.name);
		expect(apiKey.name).toEqual(newName);
	});

	it("should fail to update api key name with a length larger than the allowed maximum", async () => {
		let result: { data: Partial<ApiKey> | null; error: Err | null } = {
			data: null,
			error: null,
		};
		try {
			const apiKey = await auth.api.updateApiKey({
				body: {
					keyId: firstApiKey.id,
					name: "test-api-key-that-is-longer-than-the-allowed-maximum",
				},
				headers,
			});
			result.data = apiKey;
		} catch (error: any) {
			result.error = error;
		}
		expect(result.data).toBeNull();
		expect(result.error).toBeDefined();
		expect(result.error?.status).toEqual("BAD_REQUEST");
		expect(result.error?.body.message).toEqual(ERROR_CODES.INVALID_NAME_LENGTH);
	});

	it("should fail to update api key name with a length smaller than the allowed minimum", async () => {
		let result: { data: Partial<ApiKey> | null; error: Err | null } = {
			data: null,
			error: null,
		};
		try {
			const apiKey = await auth.api.updateApiKey({
				body: {
					keyId: firstApiKey.id,
					name: "",
				},
				headers,
			});
			result.data = apiKey;
		} catch (error: any) {
			result.error = error;
		}
		expect(result.data).toBeNull();
		expect(result.error).toBeDefined();
		expect(result.error?.status).toEqual("BAD_REQUEST");
		expect(result.error?.body.message).toEqual(ERROR_CODES.INVALID_NAME_LENGTH);
	});

	it("should fail to update api key with no values to update", async () => {
		let result: { data: Partial<ApiKey> | null; error: Err | null } = {
			data: null,
			error: null,
		};
		try {
			const apiKey = await auth.api.updateApiKey({
				body: {
					keyId: firstApiKey.id,
				},
				headers,
			});
			result.data = apiKey;
		} catch (error: any) {
			result.error = error;
		}

		expect(result.data).toBeNull();
		expect(result.error).toBeDefined();
		expect(result.error?.status).toEqual("BAD_REQUEST");
		expect(result.error?.body.message).toEqual(ERROR_CODES.NO_VALUES_TO_UPDATE);
	});

	it("should update api key expiresIn value", async () => {
		const expiresIn = 1000 * 60 * 60 * 24 * 7; // 7 days
		const expectedResult = new Date().getTime() + expiresIn;
		const apiKey = await auth.api.updateApiKey({
			body: {
				keyId: firstApiKey.id,
				expiresIn: expiresIn,
			},
			headers,
		});
		expect(apiKey).not.toBeNull();
		expect(apiKey.expiresAt).toBeDefined();
		expect(apiKey.expiresAt?.getTime()).toBeGreaterThanOrEqual(expectedResult);
	});

	it("should fail to update expiresIn value if `disableCustomExpiresTime` is enabled", async () => {
		const { client, auth, signInWithTestUser } = await getTestInstance(
			{
				plugins: [
					apiKey({
						keyExpiration: {
							disableCustomExpiresTime: true,
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [apiKeyClient()],
				},
			},
		);
		const { headers } = await signInWithTestUser();

		const { data: firstApiKey } = await client.apiKey.create({}, { headers });

		if (!firstApiKey) return;

		let result: { data: Partial<ApiKey> | null; error: Err | null } = {
			data: null,
			error: null,
		};
		try {
			const apiKey = await auth.api.updateApiKey({
				body: {
					keyId: firstApiKey.id,
					expiresIn: 1000 * 60 * 60 * 24 * 7, // 7 days
				},
				headers,
			});
			result.data = apiKey;
		} catch (error: any) {
			result.error = error;
		}
		expect(result.data).toBeNull();
		expect(result.error).toBeDefined();
		expect(result.error?.status).toEqual("BAD_REQUEST");
		expect(result.error?.body.message).toEqual(
			ERROR_CODES.KEY_DISABLED_EXPIRATION,
		);
	});

	it("should fail to update expiresIn value if it's smaller than the allowed minimum", async () => {
		const { client, auth, signInWithTestUser } = await getTestInstance(
			{
				plugins: [
					apiKey({
						keyExpiration: {
							minExpiresIn: 1,
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [apiKeyClient()],
				},
			},
		);
		const { headers } = await signInWithTestUser();

		const { data: firstApiKey } = await client.apiKey.create({}, { headers });

		if (!firstApiKey) return;

		let result: { data: Partial<ApiKey> | null; error: Err | null } = {
			data: null,
			error: null,
		};
		try {
			const apiKey = await auth.api.updateApiKey({
				body: {
					keyId: firstApiKey.id,
					expiresIn: 0,
				},
				headers,
			});
			result.data = apiKey;
		} catch (error: any) {
			result.error = error;
		}
		expect(result.data).toBeNull();
		expect(result.error).toBeDefined();
		expect(result.error?.status).toEqual("BAD_REQUEST");
		expect(result.error?.body.message).toEqual(
			ERROR_CODES.EXPIRES_IN_IS_TOO_SMALL,
		);
	});

	it("should fail to update expiresIn value if it's larger than the allowed maximum", async () => {
		const { client, auth, signInWithTestUser } = await getTestInstance(
			{
				plugins: [
					apiKey({
						keyExpiration: {
							maxExpiresIn: 1,
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [apiKeyClient()],
				},
			},
		);
		const { headers } = await signInWithTestUser();

		const { data: firstApiKey } = await client.apiKey.create({}, { headers });

		if (!firstApiKey) return;

		let result: { data: Partial<ApiKey> | null; error: Err | null } = {
			data: null,
			error: null,
		};
		try {
			const apiKey = await auth.api.updateApiKey({
				body: {
					keyId: firstApiKey.id,
					expiresIn: 1000 * 60 * 60 * 24 * 365 * 10, // 10 years
				},
				headers,
			});
			result.data = apiKey;
		} catch (error: any) {
			result.error = error;
		}
		expect(result.data).toBeNull();
		expect(result.error).toBeDefined();
		expect(result.error?.status).toEqual("BAD_REQUEST");
		expect(result.error?.body.message).toEqual(
			ERROR_CODES.EXPIRES_IN_IS_TOO_LARGE,
		);
	});

	it("should update API key remaining count", async () => {
		const remaining = 100;
		const apiKey = await auth.api.updateApiKey({
			body: {
				keyId: firstApiKey.id,
				remaining: remaining,
			},
			headers,
		});

		expect(apiKey).not.toBeNull();
		expect(apiKey.remaining).toEqual(remaining);
	});

	it("should fail to update the remaining count if it's smaller than the allowed minimum", async () => {
		let result: { data: Partial<ApiKey> | null; error: Err | null } = {
			data: null,
			error: null,
		};
		try {
			const apiKey = await auth.api.updateApiKey({
				body: {
					keyId: firstApiKey.id,
					remaining: 0,
				},
				headers,
			});
			result.data = apiKey;
		} catch (error: any) {
			result.error = error;
		}
		expect(result.data).toBeNull();
		expect(result.error).toBeDefined();
		expect(result.error?.status).toEqual("BAD_REQUEST");
		expect(result.error?.body.message).toEqual(ERROR_CODES.INVALID_REMAINING);
	});

	it("should fail to update the remaining count if it's larger than the allowed maximum", async () => {
		let result: { data: Partial<ApiKey> | null; error: Err | null } = {
			data: null,
			error: null,
		};
		try {
			const apiKey = await auth.api.updateApiKey({
				body: {
					keyId: firstApiKey.id,
					remaining: Number.MAX_SAFE_INTEGER,
				},
				headers,
			});
			result.data = apiKey;
		} catch (error: any) {
			result.error = error;
		}
		expect(result.data).toBeNull();
		expect(result.error).toBeDefined();
		expect(result.error?.status).toEqual("BAD_REQUEST");
		expect(result.error?.body.message).toEqual(ERROR_CODES.INVALID_REMAINING);
	});

	it("should fail update the refillInterval value since it requires refillAmount as well", async () => {
		let result: { data: Partial<ApiKey> | null; error: Err | null } = {
			data: null,
			error: null,
		};
		try {
			const apiKey = await auth.api.updateApiKey({
				body: {
					keyId: firstApiKey.id,
					refillInterval: 1000,
				},
				headers,
			});
			result.data = apiKey;
		} catch (error: any) {
			result.error = error;
		}
		expect(result.data).toBeNull();
		expect(result.error).toBeDefined();
		expect(result.error?.status).toEqual("BAD_REQUEST");
		expect(result.error?.body.message).toEqual(
			ERROR_CODES.REFILL_INTERVAL_AND_AMOUNT_REQUIRED,
		);
	});

	it("should fail update the refillAmount value since it requires refillInterval as well", async () => {
		let result: { data: Partial<ApiKey> | null; error: Err | null } = {
			data: null,
			error: null,
		};
		try {
			const apiKey = await auth.api.updateApiKey({
				body: {
					keyId: firstApiKey.id,
					refillAmount: 10,
				},
				headers,
			});
			result.data = apiKey;
		} catch (error: any) {
			result.error = error;
		}
		expect(result.data).toBeNull();
		expect(result.error).toBeDefined();
		expect(result.error?.status).toEqual("BAD_REQUEST");
		expect(result.error?.body.message).toEqual(
			ERROR_CODES.REFILL_AMOUNT_AND_INTERVAL_REQUIRED,
		);
	});

	it("should update the refillInterval and refillAmount value", async () => {
		const refillInterval = 10000;
		const refillAmount = 100;
		const apiKey = await auth.api.updateApiKey({
			body: {
				keyId: firstApiKey.id,
				refillInterval: refillInterval,
				refillAmount: refillAmount,
			},
			headers,
		});

		expect(apiKey).not.toBeNull();
		expect(apiKey.refillInterval).toEqual(refillInterval);
		expect(apiKey.refillAmount).toEqual(refillAmount);
	});

	it("should update api key enable value", async () => {
		const newValue = false;
		const apiKey = await auth.api.updateApiKey({
			body: {
				keyId: firstApiKey.id,
				enabled: newValue,
			},
			headers,
		});

		expect(apiKey).not.toBeNull();
		expect(apiKey.enabled).toEqual(newValue);
	});

	it("should fail to update metadata with invalid metadata type", async () => {
		let result: { data: Partial<ApiKey> | null; error: Err | null } = {
			data: null,
			error: null,
		};
		try {
			const apiKey = await auth.api.updateApiKey({
				body: {
					keyId: firstApiKey.id,
					metadata: "invalid",
				},
				headers,
			});
			result.data = apiKey;
		} catch (error: any) {
			result.error = error;
		}
		expect(result.data).toBeNull();
		expect(result.error).toBeDefined();
		expect(result.error?.status).toEqual("BAD_REQUEST");
		expect(result.error?.body.message).toEqual(
			ERROR_CODES.INVALID_METADATA_TYPE,
		);
	});

	it("should update metadata with valid metadata type", async () => {
		const metadata = {
			test: "test-123",
		};
		const apiKey = await auth.api.updateApiKey({
			body: {
				keyId: firstApiKey.id,
				metadata: metadata,
			},
			headers,
		});

		expect(apiKey).not.toBeNull();
		expect(apiKey.metadata).toEqual(metadata);
	});

	it("update api key's returned metadata should be an object", async () => {
		const metadata = {
			test: "test-12345",
		};
		const apiKey = await auth.api.updateApiKey({
			body: {
				keyId: firstApiKey.id,
				metadata: metadata,
			},
			headers,
		});

		expect(apiKey).not.toBeNull();
		expect(apiKey.metadata?.test).toBeDefined();
		expect(apiKey.metadata?.test).toEqual(metadata.test);
	});

	// =========================================================================
	// GET API KEY
	// =========================================================================

	it("should fail to get an API key by ID without headers", async () => {
		let result: { data: Partial<ApiKey> | null; error: Err | null } = {
			data: null,
			error: null,
		};
		try {
			const apiKey = await auth.api.getApiKey({
				body: {
					id: firstApiKey.id,
				},
			});
			result.data = apiKey;
		} catch (error: any) {
			result.error = error;
		}

		expect(result.data).toBeNull();
		expect(result.error).toBeDefined();
		expect(result.error?.status).toEqual("UNAUTHORIZED");
		expect(result.error?.body.message).toEqual(
			ERROR_CODES.UNAUTHORIZED_SESSION,
		);
	});

	it("should get an API key by ID with headers", async () => {
		const apiKey = await auth.api.getApiKey({
			body: {
				id: firstApiKey.id,
			},
			headers,
		});

		expect(apiKey).not.toBeNull();
		expect(apiKey.key).toBeUndefined();
		expect(apiKey.id).toEqual(firstApiKey.id);
		expect(apiKey.userId).toEqual(firstApiKey.userId);
	});

	it("should fail to get an API key by ID that doesn't exist", async () => {
		let result: { data: Partial<ApiKey> | null; error: Err | null } = {
			data: null,
			error: null,
		};
		try {
			const apiKey = await auth.api.getApiKey({
				body: {
					id: "invalid",
				},
				headers,
			});
			result.data = apiKey;
		} catch (error: any) {
			result.error = error;
		}
		expect(result.data).toBeNull();
		expect(result.error).toBeDefined();
		expect(result.error?.status).toEqual("NOT_FOUND");
		expect(result.error?.body.message).toEqual(ERROR_CODES.KEY_NOT_FOUND);
	});

	it("should successfully recieve an object metadata from an API key", async () => {
		const apiKey = await auth.api.getApiKey({
			body: {
				id: firstApiKey.id,
			},
			headers,
		});

		expect(apiKey).not.toBeNull();
		expect(apiKey.metadata).toBeDefined();
		expect(apiKey.metadata).toBeInstanceOf(Object);
	});

	it("should not define the key property for an API key when using get api key", async () => {
		const apiKey = await auth.api.getApiKey({
			body: {
				id: firstApiKey.id,
			},
			headers,
		});

		expect(apiKey).not.toBeNull();
		expect(apiKey.key).toBeUndefined();
	});

	// =========================================================================
	// LIST API KEY
	// =========================================================================

	it("should fail to list API keys without headers", async () => {
		let result: { data: Partial<ApiKey>[] | null; error: Err | null } = {
			data: null,
			error: null,
		};
		try {
			const apiKey = await auth.api.listApiKeys({});
			result.data = apiKey;
		} catch (error: any) {
			result.error = error;
		}

		expect(result.data).toBeNull();
		expect(result.error).toBeDefined();
		expect(result.error?.status).toEqual("UNAUTHORIZED");
		expect(result.error?.body.message).toEqual(
			ERROR_CODES.UNAUTHORIZED_SESSION,
		);
	});

	it("should list API keys with headers", async () => {
		const apiKeys = await auth.api.listApiKeys({
			headers,
		});

		expect(apiKeys).not.toBeNull();
		expect(apiKeys.length).toBeGreaterThan(0);
	});

	it("should list API keys with metadata as an object", async () => {
		const apiKeys = await auth.api.listApiKeys({
			headers,
		});

		expect(apiKeys).not.toBeNull();
		expect(apiKeys.length).toBeGreaterThan(0);
		apiKeys.map((apiKey) => {
			if (apiKey.metadata) {
				expect(apiKey.metadata).toBeInstanceOf(Object);
			}
		});
	});

	// =========================================================================
	// Sessions from API keys
	// =========================================================================

	it("should get session from an API key", async () => {
		const headers = new Headers();
		headers.set("x-api-key", firstApiKey.key);

		const session = await auth.api.getSession({
			headers: headers,
		});

		expect(session?.session).toBeDefined();
	});

	it("should get session from an API key with custom api key getter", async () => {
		const { client, auth, signInWithTestUser } = await getTestInstance(
			{
				plugins: [
					apiKey({
						customAPIKeyGetter: (ctx) => ctx.headers?.get("xyz-api-key")!,
					}),
				],
			},
			{
				clientOptions: {
					plugins: [apiKeyClient()],
				},
			},
		);

		const { headers: userHeaders } = await signInWithTestUser();

		const { data: apiKey2 } = await client.apiKey.create(
			{},
			{ headers: userHeaders },
		);
		if (!apiKey2) return;

		const headers = new Headers();
		headers.set("xyz-api-key", apiKey2.key);
		const session = await auth.api.getSession({
			headers,
		});

		expect(session?.session).toBeDefined();
	});

	it("should fail to get session from an API key with invalid api key", async () => {
		const headers = new Headers();
		headers.set("x-api-key", "invalid");

		let result: { data: any; error: any | null } = {
			data: null,
			error: null,
		};

		try {
			const session = await auth.api.getSession({
				headers,
			});
			result.data = session;
		} catch (error: any) {
			result.error = error;
		}

		expect(result.error?.status).toEqual("UNAUTHORIZED");
		expect(result.error?.body?.message).toEqual(ERROR_CODES.INVALID_API_KEY);
	});

	it("should still work if the key headers was an array", async () => {
		const { client, auth, signInWithTestUser } = await getTestInstance(
			{
				plugins: [
					apiKey({
						apiKeyHeaders: ["x-api-key", "xyz-api-key"],
					}),
				],
			},
			{
				clientOptions: {
					plugins: [apiKeyClient()],
				},
			},
		);
		const { headers: userHeaders } = await signInWithTestUser();

		const { data: apiKey2 } = await client.apiKey.create(
			{},
			{ headers: userHeaders },
		);
		if (!apiKey2) return;

		const headers = new Headers();
		headers.set("xyz-api-key", apiKey2.key);

		const session = await auth.api.getSession({
			headers: headers,
		});
		expect(session?.session).toBeDefined();

		const headers2 = new Headers();
		headers2.set("x-api-key", apiKey2.key);

		const session2 = await auth.api.getSession({
			headers: headers2,
		});
		expect(session2?.session).toBeDefined();
	});

	

	// =========================================================================
	// DELETE API KEY
	// =========================================================================

	it("should fail to delete an API key by ID without headers", async () => {
		let result: { data: { success: boolean } | null; error: Err | null } = {
			data: null,
			error: null,
		};
		try {
			const apiKey = await auth.api.deleteApiKey({
				body: {
					keyId: firstApiKey.id,
				},
			});
			result.data = apiKey;
		} catch (error: any) {
			result.error = error;
		}

		expect(result.data).toBeNull();
		expect(result.error).toBeDefined();
		expect(result.error?.status).toEqual("UNAUTHORIZED");
		expect(result.error?.body.message).toEqual(
			ERROR_CODES.UNAUTHORIZED_SESSION,
		);
	});

	it("should delete an API key by ID with headers", async () => {
		const apiKey = await auth.api.deleteApiKey({
			body: {
				keyId: firstApiKey.id,
			},
			headers,
		});

		expect(apiKey).not.toBeNull();
		expect(apiKey.success).toEqual(true);
	});

	it("should fail to delete an API key by ID that doesn't exist", async () => {
		let result: { data: { success: boolean } | null; error: Err | null } = {
			data: null,
			error: null,
		};
		try {
			const apiKey = await auth.api.deleteApiKey({
				body: {
					keyId: "invalid",
				},
				headers,
			});
			result.data = apiKey;
		} catch (error: any) {
			result.error = error;
		}
		expect(result.data).toBeNull();
		expect(result.error).toBeDefined();
		expect(result.error?.status).toEqual("NOT_FOUND");
		expect(result.error?.body.message).toEqual(ERROR_CODES.KEY_NOT_FOUND);
	});
});
