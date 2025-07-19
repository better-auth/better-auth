import { describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { apiKey, ERROR_CODES } from ".";
import { apiKeyClient } from "./client";
import type { ApiKey } from "./types";
import { APIError } from "better-call";

describe("api-key", async () => {
	const { client, auth, signInWithTestUser } = await getTestInstance(
		{
			plugins: [
				apiKey({
					enableMetadata: true,
					permissions: {
						defaultPermissions: {
							files: ["read"],
						},
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

	it("should fail to create API Keys from server without headers and userId", async () => {
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

	it("should successfully create API keys from server with userId", async () => {
		const apiKey = await auth.api.createApiKey({
			body: {
				userId: user.id,
			},
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
		expect(apiKey.rateLimitEnabled).toBe(true);
	});

	it("should have the real value from rateLimitEnabled", async () => {
		const apiKey = await auth.api.createApiKey({
			body: {
				userId: user.id,
				rateLimitEnabled: false,
			},
		});

		expect(apiKey).not.toBeNull();
		expect(apiKey.rateLimitEnabled).toBe(false);
	});

	it("should have true if the rate limit is undefined", async () => {
		const apiKey = await auth.api.createApiKey({
			body: {
				userId: user.id,
				rateLimitEnabled: undefined,
			},
		});

		expect(apiKey).not.toBeNull();
		expect(apiKey.rateLimitEnabled).toBe(true);
	});

	it("should require name in API keys if configured", async () => {
		const { auth, signInWithTestUser } = await getTestInstance(
			{
				plugins: [
					apiKey({
						requireName: true,
					}),
				],
			},
			{
				clientOptions: {
					plugins: [apiKeyClient()],
				},
			},
		);

		const { user } = await signInWithTestUser();
		let err: any;
		try {
			const apiKeyResult = await auth.api.createApiKey({
				body: {
					userId: user.id,
				},
			});
		} catch (error) {
			err = error;
		}
		expect(err).toBeDefined();
		expect(err.body.message).toBe(ERROR_CODES.NAME_REQUIRED);
	});

	it("should respect rateLimit configuration from plugin options", async () => {
		const { auth, signInWithTestUser } = await getTestInstance(
			{
				plugins: [
					apiKey({
						rateLimit: {
							enabled: false,
							timeWindow: 1000,
							maxRequests: 10,
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

		const { user } = await signInWithTestUser();
		const apiKeyResult = await auth.api.createApiKey({
			body: {
				userId: user.id,
			},
		});

		expect(apiKeyResult).not.toBeNull();
		expect(apiKeyResult.rateLimitEnabled).toBe(false);
		expect(apiKeyResult.rateLimitTimeWindow).toBe(1000);
		expect(apiKeyResult.rateLimitMax).toBe(10);
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
		const expiresIn = 60 * 60 * 24 * 7; // 7 days
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

	it("should support disabling key hashing", async () => {
		const { auth, signInWithTestUser } = await getTestInstance(
			{
				plugins: [
					apiKey({
						disableKeyHashing: true,
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

		const apiKey2 = await auth.api.createApiKey({
			body: {},
			headers,
		});
		const res = await (await auth.$context).adapter.findOne<ApiKey>({
			model: "apikey",
			where: [
				{
					field: "id",
					value: apiKey2.id,
				},
			],
		});
		expect(res?.key).toEqual(apiKey2.key);
	});

	it("should be able to verify with key hashing disabled", async () => {
		const { auth, signInWithTestUser } = await getTestInstance(
			{
				plugins: [
					apiKey({
						disableKeyHashing: true,
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

		const apiKey2 = await auth.api.createApiKey({
			body: {},
			headers,
		});

		const result = await auth.api.verifyApiKey({ body: { key: apiKey2.key } });
		expect(result.valid).toEqual(true);
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
			const expiresIn = 60 * 60 * 24 * 0.5; // half a day
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
			const expiresIn = 60 * 60 * 24 * 365 * 10; // 10 year
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

	it("should fail to create API key with custom refillAndAmount from client auth", async () => {
		const apiKey = await client.apiKey.create(
			{
				refillAmount: 10,
			},
			{ headers },
		);

		expect(apiKey.data).toBeNull();
		expect(apiKey.error).toBeDefined();
		expect(apiKey.error?.statusText).toEqual("BAD_REQUEST");
		expect(apiKey.error?.message).toEqual(ERROR_CODES.SERVER_ONLY_PROPERTY);

		const apiKey2 = await client.apiKey.create(
			{
				refillInterval: 1001,
			},
			{ headers },
		);

		expect(apiKey2.data).toBeNull();
		expect(apiKey2.error).toBeDefined();
		expect(apiKey2.error?.statusText).toEqual("BAD_REQUEST");
		expect(apiKey2.error?.message).toEqual(ERROR_CODES.SERVER_ONLY_PROPERTY);
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
					userId: user.id,
				},
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
					userId: user.id,
				},
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
				userId: user.id,
			},
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
				userId: user.id,
			},
		});

		expect(apiKey).not.toBeNull();
		expect(apiKey.remaining).toEqual(remaining);
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

		const res = await auth.api.getApiKey({
			query: {
				id: apiKey.id,
			},
			headers,
		});

		expect(res).not.toBeNull();
		if (res) {
			expect(res.metadata).toEqual(metadata);
		}
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

	it("create API key with with metadata when metadata is disabled (should fail)", async () => {
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

	it("should have the first 6 chracaters of the key as the start property", async () => {
		const { data: apiKey } = await client.apiKey.create(
			{},
			{ headers: headers },
		);

		expect(apiKey?.start).toBeDefined();
		expect(apiKey?.start?.length).toEqual(6);
		expect(apiKey?.start).toEqual(apiKey?.key?.substring(0, 6));
	});

	it("should have the start property as null if shouldStore is false", async () => {
		const { client, auth, signInWithTestUser } = await getTestInstance(
			{
				plugins: [
					apiKey({
						startingCharactersConfig: {
							shouldStore: false,
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
			{},
			{ headers: headers },
		);

		expect(apiKey2?.start).toBeNull();
	});

	it("should use the defined charactersLength if provided", async () => {
		const customLength = 3;
		const { client, auth, signInWithTestUser } = await getTestInstance(
			{
				plugins: [
					apiKey({
						startingCharactersConfig: {
							shouldStore: true,
							charactersLength: customLength,
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
			{},
			{ headers: headers },
		);

		expect(apiKey2?.start).toBeDefined();
		expect(apiKey2?.start?.length).toEqual(customLength);
		expect(apiKey2?.start).toEqual(apiKey2?.key?.substring(0, customLength));
	});

	it("should fail to create API key with custom rate-limit options from client auth", async () => {
		const apiKey = await client.apiKey.create(
			{
				rateLimitMax: 15,
			},
			{ headers },
		);

		expect(apiKey.data).toBeNull();
		expect(apiKey.error).toBeDefined();
		expect(apiKey.error?.statusText).toEqual("BAD_REQUEST");
		expect(apiKey.error?.message).toEqual(ERROR_CODES.SERVER_ONLY_PROPERTY);

		const apiKey2 = await client.apiKey.create(
			{
				rateLimitTimeWindow: 1001,
			},
			{ headers },
		);

		expect(apiKey2.data).toBeNull();
		expect(apiKey2.error).toBeDefined();
		expect(apiKey2.error?.statusText).toEqual("BAD_REQUEST");
		expect(apiKey2.error?.message).toEqual(ERROR_CODES.SERVER_ONLY_PROPERTY);
	});

	it("should successfully apply custom rate-limit options on the newly created API key", async () => {
		const apiKey = await auth.api.createApiKey({
			body: {
				rateLimitMax: 15,
				rateLimitTimeWindow: 1000,
				userId: user.id,
			},
		});

		expect(apiKey).not.toBeNull();
		expect(apiKey?.rateLimitMax).toEqual(15);
		expect(apiKey?.rateLimitTimeWindow).toEqual(1000);
	});

	// =========================================================================
	// VERIFY API KEY
	// =========================================================================

	it("verify API key without key and userId", async () => {
		const apiKey = await auth.api.verifyApiKey({
			body: {
				key: firstApiKey.key,
			},
		});
		expect(apiKey.key).not.toBe(null);
		expect(apiKey.valid).toBe(true);
	});

	it("verify API key with invalid key (should fail)", async () => {
		const apiKey = await auth.api.verifyApiKey({
			body: {
				key: "invalid",
			},
		});
		expect(apiKey.valid).toBe(false);
		expect(apiKey.error?.code).toBe("KEY_NOT_FOUND");
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

	it("should fail to verify API key 20 times in a row due to rate-limit", async () => {
		const { data: apiKey2 } = await rateLimitClient.apiKey.create(
			{},
			{ headers: rateLimitUserHeaders },
		);
		if (!apiKey2) return;
		rateLimitedApiKey = apiKey2;
		for (let i = 0; i < 20; i++) {
			const response = await rateLimitAuth.api.verifyApiKey({
				body: {
					key: apiKey2.key,
				},
				headers: rateLimitUserHeaders,
			});
			if (i >= 10) {
				expect(response.error?.code).toBe("RATE_LIMITED");
			} else {
				expect(response.error).toBeNull();
			}
		}
	});

	it("should allow us to verify API key after rate-limit window has passed", async () => {
		vi.useFakeTimers();
		await vi.advanceTimersByTimeAsync(1000);
		const response = await rateLimitAuth.api.verifyApiKey({
			body: {
				key: rateLimitedApiKey.key,
			},
			headers: rateLimitUserHeaders,
		});
		expect(response.error).toBeNull();
		expect(response?.valid).toBe(true);
	});

	it("should check if verifying an API key's remaining count does go down", async () => {
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
		expect(afterVerificationOnce?.key?.remaining).toEqual(remaining - 1);
		const afterVerificationTwice = await auth.api.verifyApiKey({
			body: {
				key: apiKey.key,
			},
			headers,
		});
		expect(afterVerificationTwice?.valid).toEqual(true);
		expect(afterVerificationTwice?.key?.remaining).toEqual(remaining - 2);
	});

	it("should fail if the API key has no remaining", async () => {
		const apiKey = await auth.api.createApiKey({
			body: {
				remaining: 1,
				userId: user.id,
			},
		});
		if (!apiKey) return;
		// run verify once to make the remaining count go down to 0
		await auth.api.verifyApiKey({
			body: {
				key: apiKey.key,
			},
			headers,
		});
		const afterVerification = await auth.api.verifyApiKey({
			body: {
				key: apiKey.key,
			},
			headers,
		});
		expect(afterVerification.error?.code).toBe("USAGE_EXCEEDED");
	});

	it("should fail if the API key is expired", async () => {
		vi.useRealTimers();
		const { headers } = await signInWithTestUser();
		const apiKey2 = await client.apiKey.create(
			{
				expiresIn: 60 * 60 * 24,
			},
			{ headers: headers, throw: true },
		);
		vi.useFakeTimers();
		await vi.advanceTimersByTimeAsync(1000 * 60 * 60 * 24 * 2);
		const afterVerification = await auth.api.verifyApiKey({
			body: {
				key: apiKey2.key,
			},
			headers,
		});
		expect(afterVerification.error?.code).toEqual("KEY_EXPIRED");
		vi.useRealTimers();
	});

	// =========================================================================
	// UPDATE API KEY
	// =========================================================================

	it("should fail to update API key name without headers or userId", async () => {
		let error: APIError | null = null;
		await auth.api
			.updateApiKey({
				body: {
					keyId: firstApiKey.id,
					name: "test-api-key",
				},
			})
			.catch((e) => {
				error = e;
			});
		expect(error).not.toBeNull();
		expect(error).toBeInstanceOf(APIError);
	});

	it("should update API key name with headers", async () => {
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

	it("should fail to update API key name with a length larger than the allowed maximum", async () => {
		let error: APIError | null = null;
		await auth.api
			.updateApiKey({
				body: {
					keyId: firstApiKey.id,
					name: "test-api-key-that-is-longer-than-the-allowed-maximum",
				},
				headers,
			})
			.catch((e) => {
				if (e instanceof APIError) {
					error = e;
					expect(error?.status).toEqual("BAD_REQUEST");
					expect(error?.body?.message).toEqual(ERROR_CODES.INVALID_NAME_LENGTH);
				}
			});
		expect(error).not.toBeNull();
	});

	it("should fail to update API key name with a length smaller than the allowed minimum", async () => {
		let error: APIError | null = null;
		await auth.api
			.updateApiKey({
				body: {
					keyId: firstApiKey.id,
					name: "",
				},
				headers,
			})
			.catch((e) => {
				if (e instanceof APIError) {
					error = e;
					expect(error?.status).toEqual("BAD_REQUEST");
					expect(error?.body?.message).toEqual(ERROR_CODES.INVALID_NAME_LENGTH);
				}
			});
		expect(error).not.toBeNull();
	});

	it("should fail to update API key with no values to update", async () => {
		let error: APIError | null = null;
		await auth.api
			.updateApiKey({
				body: {
					keyId: firstApiKey.id,
				},
				headers,
			})
			.catch((e) => {
				if (e instanceof APIError) {
					error = e;
					expect(error?.status).toEqual("BAD_REQUEST");
					expect(error?.body?.message).toEqual(ERROR_CODES.NO_VALUES_TO_UPDATE);
				}
			});
		expect(error).not.toBeNull();
	});

	it("should update API key expiresIn value", async () => {
		const expiresIn = 60 * 60 * 24 * 7; // 7 days
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
					expiresIn: 1,
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
				userId: user.id,
			},
		});

		expect(apiKey).not.toBeNull();
		expect(apiKey.remaining).toEqual(remaining);
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
					userId: user.id,
				},
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
					userId: user.id,
				},
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
				userId: user.id,
			},
		});

		expect(apiKey).not.toBeNull();
		expect(apiKey.refillInterval).toEqual(refillInterval);
		expect(apiKey.refillAmount).toEqual(refillAmount);
	});

	it("should update API key enable value", async () => {
		const newValue = false;
		const apiKey = await auth.api.updateApiKey({
			body: {
				keyId: firstApiKey.id,
				enabled: newValue,
				userId: user.id,
			},
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
					userId: user.id,
				},
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
				userId: user.id,
			},
		});

		expect(apiKey).not.toBeNull();
		expect(apiKey.metadata).toEqual(metadata);
	});

	it("update API key's returned metadata should be an object", async () => {
		const metadata = {
			test: "test-12345",
		};
		const apiKey = await auth.api.updateApiKey({
			body: {
				keyId: firstApiKey.id,
				metadata: metadata,
				userId: user.id,
			},
		});

		expect(apiKey).not.toBeNull();
		expect(apiKey.metadata?.test).toBeDefined();
		expect(apiKey.metadata?.test).toEqual(metadata.test);
	});

	// =========================================================================
	// GET API KEY
	// =========================================================================

	it("should get an API key by id", async () => {
		const apiKey = await client.apiKey.get({
			query: {
				id: firstApiKey.id,
			},
			fetchOptions: {
				headers,
			},
		});
		expect(apiKey.data).not.toBeNull();
		expect(apiKey.data?.id).toBe(firstApiKey.id);
	});

	it("should fail to get an API key by ID that doesn't exist", async () => {
		const result = await client.apiKey.get(
			{
				query: {
					id: "invalid",
				},
			},
			{ headers },
		);
		expect(result.data).toBeNull();
		expect(result.error).toBeDefined();
		expect(result.error?.status).toEqual(404);
	});

	it("should successfully receive an object metadata from an API key", async () => {
		const apiKey = await client.apiKey.get(
			{
				query: {
					id: firstApiKey.id,
				},
			},
			{
				headers,
			},
		);
		expect(apiKey).not.toBeNull();
		expect(apiKey.data?.metadata).toBeDefined();
		expect(apiKey.data?.metadata).toBeInstanceOf(Object);
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
		const { client, auth, signInWithTestUser } = await getTestInstance(
			{
				plugins: [apiKey()],
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
		headers.set("x-api-key", apiKey2.key);

		const session = await auth.api.getSession({
			headers: headers,
		});

		expect(session?.session).toBeDefined();
	});

	it("should get session from an API key with custom API key getter", async () => {
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

	it("should fail to get session from an API key with invalid API key", async () => {
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

		expect(result.error?.status).toEqual("FORBIDDEN");
		expect(result.error?.body?.message).toEqual(ERROR_CODES.INVALID_API_KEY);
	});

	it("should fail to get session from an API key if the key is disabled", async () => {
		const { headers: userHeaders } = await signInWithTestUser();

		const { data: apiKey2 } = await client.apiKey.create(
			{},
			{ headers: userHeaders },
		);

		if (!apiKey2) throw new Error("API key not found");

		await client.apiKey.update(
			{
				keyId: apiKey2.id,
				enabled: false,
			},
			{ headers: userHeaders },
		);

		let result: { data: any; error: any | null } = {
			data: null,
			error: null,
		};

		const headers = new Headers();
		headers.set("x-api-key", apiKey2.key);

		try {
			const session = await auth.api.getSession({
				headers,
			});

			result.data = session;
		} catch (error: any) {
			result.error = error;
		}

		expect(result.error?.status).toEqual("UNAUTHORIZED");
		expect(result.error?.body?.message).toEqual(ERROR_CODES.KEY_DISABLED);
	});

	it("should fail to get session from an API key if the key is expired", async () => {
		const { headers: userHeaders } = await signInWithTestUser();

		const { data: apiKey2 } = await client.apiKey.create(
			{},
			{ headers: userHeaders },
		);

		if (!apiKey2) throw new Error("API key not found");

		await client.apiKey.update(
			{
				keyId: apiKey2.id,
				expiresIn: 1 * 60 * 60 * 24, //1 day
			},
			{ headers: userHeaders, throw: true, disableValidation: true },
		);

		vi.useFakeTimers();
		// we advance to more than 1 day
		await vi.advanceTimersByTimeAsync(1000 * 60 * 60 * 24 + 1);

		const headers = new Headers();
		headers.set("x-api-key", apiKey2.key);

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
		expect(result.error?.body?.message).toEqual(ERROR_CODES.KEY_EXPIRED);
		vi.useRealTimers();
	});

	it("should fail to get the session if the key has no remaining requests", async () => {
		const createdApiKey = await auth.api.createApiKey({
			body: {
				userId: user.id,
			},
		});

		if (!createdApiKey) throw new Error("API key not found");

		await auth.api.updateApiKey({
			body: {
				keyId: createdApiKey.id,
				remaining: 1,
				userId: user.id,
			},
		});

		const headers = new Headers();
		headers.set("x-api-key", createdApiKey.key);

		let result: { data: any; error: any | null } = {
			data: null,
			error: null,
		};

		// Login once. This should work
		const session = await auth.api.getSession({
			headers,
		});

		expect(session).not.toBeNull();

		try {
			// Login again. This should fail
			const session = await auth.api.getSession({
				headers,
			});
			result.data = session;
		} catch (error: any) {
			result.error = error;
		}

		expect(result.error?.status).toEqual("TOO_MANY_REQUESTS");
		expect(result.error?.body?.message).toEqual(ERROR_CODES.USAGE_EXCEEDED);
		expect(result.error?.body?.code).toEqual("USAGE_EXCEEDED");
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

	it("should delete an API key by ID with headers using auth-client", async () => {
		const newApiKey = await client.apiKey.create({}, { headers: headers });
		if (!newApiKey.data) return;

		const apiKey = await client.apiKey.delete(
			{
				keyId: newApiKey.data.id,
			},
			{ headers },
		);

		if (!apiKey.data?.success) {
			console.log(apiKey.error);
		}

		expect(apiKey).not.toBeNull();
		expect(apiKey.data?.success).toEqual(true);
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

	it("should create an API key with permissions", async () => {
		const permissions = {
			files: ["read", "write"],
			users: ["read"],
		};

		const apiKey = await auth.api.createApiKey({
			body: {
				permissions,
				userId: user.id,
			},
		});
		expect(apiKey).not.toBeNull();
		expect(apiKey.permissions).toEqual(permissions);
	});

	it("should have permissions as an object from getApiKey", async () => {
		const permissions = {
			files: ["read", "write"],
			users: ["read"],
		};

		const apiKey = await auth.api.createApiKey({
			body: {
				permissions,
				userId: user.id,
			},
			headers,
		});
		const apiKeyResults = await auth.api.getApiKey({
			query: {
				id: apiKey.id,
			},
			headers,
		});

		expect(apiKeyResults).not.toBeNull();
		expect(apiKeyResults.permissions).toEqual(permissions);
	});

	it("should have permissions as an object from verifyApiKey", async () => {
		const permissions = {
			files: ["read", "write"],
			users: ["read"],
		};

		const apiKey = await auth.api.createApiKey({
			body: {
				permissions,
				userId: user.id,
			},
			headers,
		});
		const apiKeyResults = await auth.api.verifyApiKey({
			body: {
				key: apiKey.key,
				permissions: {
					files: ["read"],
				},
			},
			headers,
		});

		expect(apiKeyResults).not.toBeNull();
		expect(apiKeyResults.key?.permissions).toEqual(permissions);
	});

	it("should create an API key with default permissions", async () => {
		const apiKey = await auth.api.createApiKey({
			body: {
				userId: user.id,
			},
		});
		expect(apiKey).not.toBeNull();
		expect(apiKey.permissions).toEqual({
			files: ["read"],
		});
	});

	it("should have valid metadata from key verification results", async () => {
		const metadata = {
			test: "hello-world-123",
		};
		const apiKey = await auth.api.createApiKey({
			body: {
				userId: user.id,
				metadata: metadata,
			},
			headers,
		});

		expect(apiKey).not.toBeNull();
		if (apiKey) {
			const result = await auth.api.verifyApiKey({
				body: {
					key: apiKey.key,
				},
				headers,
			});

			expect(result.valid).toBe(true);
			expect(result.error).toBeNull();
			expect(result.key?.metadata).toEqual(metadata);
		}
	});

	it("should verify an API key with matching permissions", async () => {
		const permissions = {
			files: ["read", "write"],
			users: ["read"],
		};

		const apiKey = await auth.api.createApiKey({
			body: {
				permissions,
				userId: user.id,
			},
		});

		const result = await auth.api.verifyApiKey({
			body: {
				key: apiKey.key,
				permissions: {
					files: ["read"],
				},
			},
		});

		expect(result.valid).toBe(true);
		expect(result.error).toBeNull();
		expect(result.key?.permissions).toEqual(permissions);
	});

	it("should fail to verify an API key with non-matching permissions", async () => {
		const permissions = {
			files: ["read"],
			users: ["read"],
		};

		const apiKey = await auth.api.createApiKey({
			body: {
				permissions,
				userId: user.id,
			},
		});

		const result = await auth.api.verifyApiKey({
			body: {
				key: apiKey.key,
				permissions: {
					files: ["write"],
				},
			},
		});

		expect(result.valid).toBe(false);
		expect(result.error?.code).toBe("KEY_NOT_FOUND");
	});

	it("should fail to verify when required permissions are specified but API key has no permissions", async () => {
		const apiKey = await auth.api.createApiKey({
			body: {
				userId: user.id,
			},
		});

		const result = await auth.api.verifyApiKey({
			body: {
				key: apiKey.key,
				permissions: {
					files: ["write"],
				},
			},
		});

		expect(result.valid).toBe(false);
		expect(result.error?.code).toBe("KEY_NOT_FOUND");
	});

	it("should update an API key with permissions", async () => {
		const permissions = {
			files: ["read", "write"],
			users: ["read"],
		};
		const createdApiKey = await auth.api.createApiKey({
			body: {
				userId: user.id,
			},
		});
		expect(createdApiKey.permissions).not.toEqual(permissions);
		const apiKey = await auth.api.updateApiKey({
			body: {
				keyId: createdApiKey.id,
				permissions,
				userId: user.id,
			},
		});
		expect(apiKey).not.toBeNull();
		expect(apiKey.permissions).toEqual(permissions);
	});
});
