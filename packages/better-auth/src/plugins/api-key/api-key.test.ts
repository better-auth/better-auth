import { APIError } from "better-call";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { apiKey, ERROR_CODES } from ".";
import { apiKeyClient } from "./client";
import type { ApiKey } from "./types";

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

	it("should fail to create api keys from the client if user id is provided", async () => {
		const { headers, user } = await signInWithTestUser();
		const response = await client.apiKey.create({
			userId: user.id,
		});
		expect(response.error?.status).toBe(401);
		const newUser = await auth.api.signUpEmail({
			body: {
				email: "new-email@email.com",
				password: "password",
				name: "test-name",
			},
		});
		const response2 = await client.apiKey.create(
			{
				userId: newUser.user.id,
			},
			{
				headers,
			},
		);
		expect(response2.error?.status).toBe(401);
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
			await auth.api.createApiKey({
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
		const expectedResult = Date.now() + expiresIn;
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

	it("should create API Key with remaining explicitly set to null", async () => {
		const apiKey = await auth.api.createApiKey({
			body: {
				remaining: null,
				userId: user.id,
			},
		});

		expect(apiKey).not.toBeNull();
		expect(apiKey.remaining).toBeNull();
	});

	it("should create API Key with remaining explicitly set to null and refillAmount and refillInterval are also set", async () => {
		const refillAmount = 10; // Arbitrary non-null value
		const refillInterval = 1000;
		const apiKey = await auth.api.createApiKey({
			body: {
				remaining: null,
				refillAmount: refillAmount,
				refillInterval: refillInterval,
				userId: user.id,
			},
		});

		expect(apiKey).not.toBeNull();
		expect(apiKey.remaining).toBeNull();
		expect(apiKey.refillAmount).toBe(refillAmount);
		expect(apiKey.refillInterval).toBe(refillInterval);
	});

	it("should create API Key with remaining explicitly set to 0 and refillAmount also set", async () => {
		const remaining = 0;
		const refillAmount = 10; // Arbitrary non-null value
		const refillInterval = 1000;
		const apiKey = await auth.api.createApiKey({
			body: {
				remaining: remaining,
				refillAmount: refillAmount,
				refillInterval: refillInterval,
				userId: user.id,
			},
		});

		expect(apiKey).not.toBeNull();
		expect(apiKey.remaining).toBe(remaining);
		expect(apiKey.refillAmount).toBe(refillAmount);
		expect(apiKey.refillInterval).toBe(refillInterval);
	});

	it("should create API Key with remaining undefined and default value of null is respected with refillAmount and refillInterval provided", async () => {
		const refillAmount = 10; // Arbitrary non-null value
		const refillInterval = 1000;
		const apiKey = await auth.api.createApiKey({
			body: {
				refillAmount: refillAmount,
				refillInterval: refillInterval,
				userId: user.id,
			},
		});

		expect(apiKey).not.toBeNull();
		expect(apiKey.remaining).toBeNull();
		expect(apiKey.refillAmount).toBe(refillAmount);
		expect(apiKey.refillInterval).toBe(refillInterval);
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

	it("should have the first 6 characters of the key as the start property", async () => {
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

	interface Err {
		body: {
			code: string | undefined;
			message: string | undefined;
		};
		status: string;
		statusCode: string;
	}

	it("should fail to update API key name without headers or userId", async () => {
		let res: { data: ApiKey | null; error: Err | null } = {
			data: null,
			error: null,
		};
		try {
			const apiKey = await auth.api.updateApiKey({
				body: {
					keyId: firstApiKey.id,
					name: "test-api-key",
				},
			});
			res.data = apiKey as ApiKey;
		} catch (error: any) {
			res.error = error;
		}
		expect(res.data).toBeNull();
		expect(res.error).toBeDefined();
		expect(res.error?.statusCode).toEqual(401);
		expect(res.error?.status).toEqual("UNAUTHORIZED");
		expect(res.error?.body.message).toEqual(ERROR_CODES.UNAUTHORIZED_SESSION);
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
		const expectedResult = Date.now() + expiresIn;
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
	// API KEY LASTREQUEST BUG FIX (#5309)
	// =========================================================================

	it("should not modify lastRequest when updating API key configuration", async () => {
		const key = await auth.api.createApiKey({
			body: {
				userId: user.id,
			},
		});
		expect(key.lastRequest).toBeNull();

		const updated = await auth.api.updateApiKey({
			body: {
				keyId: key.id,
				name: "updated-name",
				userId: user.id,
			},
		});

		expect(updated.lastRequest).toBeNull();
	});

	it("should not auto-decrement remaining when updating API key", async () => {
		const key = await auth.api.createApiKey({
			body: {
				remaining: 100,
				userId: user.id,
			},
		});
		expect(key.remaining).toBe(100);

		const updated = await auth.api.updateApiKey({
			body: {
				keyId: key.id,
				metadata: { foo: "bar" },
				userId: user.id,
			},
		});

		expect(updated.remaining).toBe(100);
	});

	it("should allow explicit remaining updates via body parameter", async () => {
		const key = await auth.api.createApiKey({
			body: {
				remaining: 100,
				userId: user.id,
			},
		});

		const updated = await auth.api.updateApiKey({
			body: {
				keyId: key.id,
				remaining: 50,
				userId: user.id,
			},
		});

		expect(updated.remaining).toBe(50);
		expect(updated.lastRequest).toBeNull();
	});

	it("verifyApiKey should still update lastRequest", async () => {
		const key = await auth.api.createApiKey({
			body: {
				userId: user.id,
			},
		});
		expect(key.lastRequest).toBeNull();

		const verified = await auth.api.verifyApiKey({
			body: { key: key.key },
		});
		expect(verified.valid).toBe(true);

		const updated = await auth.api.getApiKey({
			query: { id: key.id },
			headers,
		});
		expect(updated.lastRequest).not.toBeNull();
		expect(updated.lastRequest).toBeInstanceOf(Date);
	});

	it("verifyApiKey should still decrement remaining", async () => {
		const key = await auth.api.createApiKey({
			body: {
				remaining: 100,
				userId: user.id,
			},
		});

		await auth.api.verifyApiKey({
			body: { key: key.key },
		});

		const updated = await auth.api.getApiKey({
			query: { id: key.id },
			headers,
		});
		expect(updated.remaining).toBe(99);
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

	describe("enableSessionForAPIKeys", () => {
		it("should get session from an API key", async () => {
			const { client, auth, signInWithTestUser } = await getTestInstance(
				{
					plugins: [
						apiKey({
							enableSessionForAPIKeys: true,
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
			headers.set("x-api-key", apiKey2.key);

			const session = await auth.api.getSession({
				headers: headers,
			});

			expect(session?.session).toBeDefined();
		});

		it("should not get session from an API key if enableSessionForAPIKeys is false", async () => {
			const { client, auth, signInWithTestUser } = await getTestInstance(
				{
					plugins: [
						apiKey({
							enableSessionForAPIKeys: false,
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
			headers.set("x-api-key", apiKey2.key);
			const session = await auth.api.getSession({
				headers: headers,
			});
			expect(session).toBeNull();
		});

		it("should get the Response object when asResponse is true", async () => {
			const { client, auth, signInWithTestUser } = await getTestInstance(
				{
					plugins: [
						apiKey({
							enableSessionForAPIKeys: true,
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
			headers.set("x-api-key", apiKey2.key);
			const res = await auth.api.getSession({
				headers: headers,
				asResponse: true,
			});
			expect(res).toBeInstanceOf(Response);
		});
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

	it("should refill API key credits after refill interval (milliseconds)", async () => {
		vi.useRealTimers();

		const refillInterval = 3600000; // 1 hour in milliseconds
		const refillAmount = 5;
		const initialRemaining = 2;

		const apiKey = await auth.api.createApiKey({
			body: {
				userId: user.id,
				remaining: initialRemaining,
				refillInterval: refillInterval,
				refillAmount: refillAmount,
			},
		});

		let result = await auth.api.verifyApiKey({
			body: {
				key: apiKey.key,
			},
		});
		expect(result.valid).toBe(true);
		expect(result.key?.remaining).toBe(initialRemaining - 1);

		result = await auth.api.verifyApiKey({
			body: {
				key: apiKey.key,
			},
		});
		expect(result.valid).toBe(true);
		expect(result.key?.remaining).toBe(0);

		result = await auth.api.verifyApiKey({
			body: {
				key: apiKey.key,
			},
		});
		expect(result.valid).toBe(false);
		expect(result.error?.code).toBe("USAGE_EXCEEDED");

		vi.useFakeTimers();
		await vi.advanceTimersByTimeAsync(refillInterval + 1000);

		result = await auth.api.verifyApiKey({
			body: {
				key: apiKey.key,
			},
		});
		expect(result.valid).toBe(true);
		expect(result.key?.remaining).toBe(refillAmount - 1);

		vi.useRealTimers();
	});

	it("should not refill API key credits before refill interval expires", async () => {
		vi.useRealTimers();

		const refillInterval = 86400000; // 24 hours in milliseconds
		const refillAmount = 10;
		const initialRemaining = 1;

		const apiKey = await auth.api.createApiKey({
			body: {
				userId: user.id,
				remaining: initialRemaining,
				refillInterval: refillInterval,
				refillAmount: refillAmount,
			},
		});

		let result = await auth.api.verifyApiKey({
			body: {
				key: apiKey.key,
			},
		});
		expect(result.valid).toBe(true);
		expect(result.key?.remaining).toBe(0);

		vi.useFakeTimers();
		await vi.advanceTimersByTimeAsync(refillInterval / 2); // Only advance half the interval

		result = await auth.api.verifyApiKey({
			body: {
				key: apiKey.key,
			},
		});
		expect(result.valid).toBe(false);
		expect(result.error?.code).toBe("USAGE_EXCEEDED");

		await vi.advanceTimersByTimeAsync(refillInterval / 2 + 1000);

		result = await auth.api.verifyApiKey({
			body: {
				key: apiKey.key,
			},
		});
		expect(result.valid).toBe(true);
		expect(result.key?.remaining).toBe(refillAmount - 1);

		vi.useRealTimers();
	});

	it("should handle multiple refill cycles correctly", async () => {
		vi.useRealTimers();

		const refillInterval = 3600000; // 1 hour in milliseconds
		const refillAmount = 3;

		const apiKey = await auth.api.createApiKey({
			body: {
				userId: user.id,
				remaining: 1,
				refillInterval: refillInterval,
				refillAmount: refillAmount,
			},
		});

		let result = await auth.api.verifyApiKey({
			body: {
				key: apiKey.key,
			},
		});
		expect(result.valid).toBe(true);
		expect(result.key?.remaining).toBe(0);

		vi.useFakeTimers();

		await vi.advanceTimersByTimeAsync(refillInterval + 1000);
		result = await auth.api.verifyApiKey({
			body: {
				key: apiKey.key,
			},
		});
		expect(result.valid).toBe(true);
		expect(result.key?.remaining).toBe(refillAmount - 1);

		for (let i = 0; i < refillAmount - 1; i++) {
			result = await auth.api.verifyApiKey({
				body: {
					key: apiKey.key,
				},
			});
			expect(result.valid).toBe(true);
		}

		result = await auth.api.verifyApiKey({
			body: {
				key: apiKey.key,
			},
		});
		expect(result.valid).toBe(false);
		expect(result.error?.code).toBe("USAGE_EXCEEDED");

		await vi.advanceTimersByTimeAsync(refillInterval + 1000);
		result = await auth.api.verifyApiKey({
			body: {
				key: apiKey.key,
			},
		});
		expect(result.valid).toBe(true);
		expect(result.key?.remaining).toBe(refillAmount - 1);

		vi.useRealTimers();
	});

	describe("secondary storage", async () => {
		let store = new Map<string, string>();
		const expirationMap = new Map<string, number>();

		const { client, auth, signInWithTestUser } = await getTestInstance(
			{
				secondaryStorage: {
					set(key, value, ttl) {
						store.set(key, value);
						if (ttl) expirationMap.set(key, ttl);
					},
					get(key) {
						return store.get(key) || null;
					},
					delete(key) {
						store.delete(key);
						expirationMap.delete(key);
					},
				},
				plugins: [
					apiKey({
						storage: "secondary-storage",
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

		beforeEach(() => {
			store.clear();
			expirationMap.clear();
		});

		it("should create API key in secondary storage", async () => {
			const { headers, user } = await signInWithTestUser();
			const { data: apiKey } = await client.apiKey.create(
				{},
				{ headers: headers },
			);

			expect(apiKey).not.toBeNull();
			expect(apiKey?.key).toBeDefined();

			// Check that API key is stored in secondary storage by ID
			expect(store.has(`api-key:by-id:${apiKey?.id}`)).toBe(true);

			// Check that user's API key list is updated
			expect(store.has(`api-key:by-user:${user.id}`)).toBe(true);

			// Verify the stored data can be retrieved
			const storedData = store.get(`api-key:by-id:${apiKey?.id}`);
			expect(storedData).toBeDefined();
			const parsed = JSON.parse(storedData!);
			expect(parsed.id).toBe(apiKey?.id);
			expect(parsed.userId).toBe(user.id);
		});

		it("should get API key from secondary storage", async () => {
			const { headers, user } = await signInWithTestUser();
			const { data: createdKey } = await client.apiKey.create(
				{},
				{ headers: headers },
			);

			expect(createdKey).not.toBeNull();

			const { data: retrievedKey } = await client.apiKey.get(
				{ query: { id: createdKey!.id } },
				{ headers: headers },
			);

			expect(retrievedKey).not.toBeNull();
			expect(retrievedKey?.id).toBe(createdKey?.id);
			expect(retrievedKey?.userId).toBe(user.id);
		});

		it("should list API keys from secondary storage", async () => {
			const { headers, user } = await signInWithTestUser();

			// Create multiple API keys
			const { data: key1 } = await client.apiKey.create(
				{},
				{ headers: headers },
			);
			const { data: key2 } = await client.apiKey.create(
				{},
				{ headers: headers },
			);

			const { data: keys } = await client.apiKey.list({
				fetchOptions: { headers: headers },
			});

			expect(keys).not.toBeNull();
			expect(keys?.length).toBeGreaterThanOrEqual(2);
			expect(keys?.some((k) => k.id === key1?.id)).toBe(true);
			expect(keys?.some((k) => k.id === key2?.id)).toBe(true);
		});

		it("should update API key in secondary storage", async () => {
			const { headers, user } = await signInWithTestUser();
			const { data: createdKey } = await client.apiKey.create(
				{ name: "Original Name" },
				{ headers: headers },
			);

			expect(createdKey).not.toBeNull();

			const { data: updatedKey } = await client.apiKey.update(
				{
					keyId: createdKey!.id,
					name: "Updated Name",
				},
				{ headers: headers },
			);

			expect(updatedKey).not.toBeNull();
			expect(updatedKey?.name).toBe("Updated Name");
			expect(updatedKey?.id).toBe(createdKey?.id);
		});

		it("should delete API key from secondary storage", async () => {
			const { headers, user } = await signInWithTestUser();
			const { data: createdKey } = await client.apiKey.create(
				{},
				{ headers: headers },
			);

			expect(createdKey).not.toBeNull();

			const { data: deleteResult } = await client.apiKey.delete(
				{ keyId: createdKey!.id },
				{ headers: headers },
			);

			expect(deleteResult?.success).toBe(true);

			// Verify it's deleted from secondary storage
			expect(store.has(`api-key:by-id:${createdKey!.id}`)).toBe(false);

			// Verify it's removed from user's list
			const userListData = store.get(`api-key:by-user:${user.id}`);
			if (userListData) {
				const userIds = JSON.parse(userListData);
				expect(userIds.includes(createdKey!.id)).toBe(false);
			}
		});

		it("should verify API key from secondary storage", async () => {
			const { headers, user } = await signInWithTestUser();
			const { data: createdKey } = await client.apiKey.create(
				{},
				{ headers: headers },
			);

			expect(createdKey).not.toBeNull();

			const result = await auth.api.verifyApiKey({
				body: {
					key: createdKey!.key,
				},
			});

			expect(result.valid).toBe(true);
			expect(result.key).not.toBeNull();
			expect(result.key?.id).toBe(createdKey?.id);
		});

		it("should set TTL when API key has expiration", async () => {
			const { headers, user } = await signInWithTestUser();
			const expiresIn = 60 * 60 * 24; // 1 day in seconds

			const { data: createdKey } = await client.apiKey.create(
				{ expiresIn },
				{ headers: headers },
			);

			expect(createdKey).not.toBeNull();
			expect(createdKey?.expiresAt).not.toBeNull();

			// Check that TTL was set in expiration map (check by ID key)
			const storedKey = `api-key:by-id:${createdKey!.id}`;
			const ttl = expirationMap.get(storedKey);
			expect(ttl).toBeDefined();
			expect(ttl).toBeGreaterThan(0);
			// TTL should be approximately expiresIn seconds (within 5 seconds tolerance)
			expect(Math.abs(ttl! - expiresIn)).toBeLessThan(5);
		});

		it("should handle metadata in secondary storage", async () => {
			const { headers, user } = await signInWithTestUser();
			const metadata = { plan: "premium", environment: "production" };

			const { data: createdKey } = await client.apiKey.create(
				{ metadata },
				{ headers: headers },
			);

			expect(createdKey).not.toBeNull();
			expect(createdKey?.metadata).toEqual(metadata);

			const { data: retrievedKey } = await client.apiKey.get(
				{ query: { id: createdKey!.id } },
				{ headers: headers },
			);

			expect(retrievedKey?.metadata).toEqual(metadata);
		});

		it("should handle rate limiting with secondary storage", async () => {
			const { headers, user } = await signInWithTestUser();
			const createdKey = await auth.api.createApiKey({
				body: {
					rateLimitEnabled: true,
					rateLimitMax: 2,
					rateLimitTimeWindow: 1000 * 60, // 1 minute
					userId: user.id,
				},
			});
			expect(createdKey).not.toBeNull();

			// First request should succeed
			let result = await auth.api.verifyApiKey({
				body: {
					key: createdKey!.key,
				},
			});
			expect(result.valid).toBe(true);

			// Second request should succeed
			result = await auth.api.verifyApiKey({
				body: {
					key: createdKey!.key,
				},
			});
			expect(result.valid).toBe(true);

			// Third request should fail due to rate limit
			result = await auth.api.verifyApiKey({
				body: {
					key: createdKey!.key,
				},
			});
			expect(result.valid).toBe(false);
			expect(result.error?.code).toBe("RATE_LIMITED");
		});

		it("should handle remaining count with secondary storage", async () => {
			const { headers, user } = await signInWithTestUser();
			const remaining = 5;

			const createdKey = await auth.api.createApiKey({
				body: {
					remaining,
					userId: user.id,
				},
			});

			expect(createdKey).not.toBeNull();
			expect(createdKey?.remaining).toBe(remaining);

			let result = await auth.api.verifyApiKey({
				body: {
					key: createdKey!.key,
				},
			});
			expect(result.valid).toBe(true);
			expect(result.key?.remaining).toBe(remaining - 1);

			result = await auth.api.verifyApiKey({
				body: {
					key: createdKey!.key,
				},
			});
			expect(result.valid).toBe(true);
			expect(result.key?.remaining).toBe(remaining - 2);
		});

		it("should handle expired keys with TTL in secondary storage", async () => {
			vi.useFakeTimers();
			const { headers, user } = await signInWithTestUser();
			// Use 1 day in seconds (minimum allowed) + 1 second for testing expiration
			const expiresIn = 60 * 60 * 24 + 1; // 86401 seconds = 1 day + 1 second

			const { data: createdKey } = await client.apiKey.create(
				{ expiresIn },
				{ headers: headers },
			);

			expect(createdKey).not.toBeNull();
			expect(createdKey?.expiresAt).not.toBeNull();

			// Advance time past expiration
			await vi.advanceTimersByTimeAsync((expiresIn + 1) * 1000);

			const result = await auth.api.verifyApiKey({
				body: {
					key: createdKey!.key,
				},
			});

			expect(result.valid).toBe(false);
			expect(result.error?.code).toBe("KEY_EXPIRED");

			vi.useRealTimers();
		});

		it("should maintain user's API key list in secondary storage", async () => {
			const { headers, user } = await signInWithTestUser();

			// Create multiple API keys for the same user
			const { data: key1 } = await client.apiKey.create(
				{},
				{ headers: headers },
			);
			const { data: key2 } = await client.apiKey.create(
				{},
				{ headers: headers },
			);
			const { data: key3 } = await client.apiKey.create(
				{},
				{ headers: headers },
			);

			// List should return all keys
			const { data: keys } = await client.apiKey.list({
				fetchOptions: { headers: headers },
			});

			expect(keys?.length).toBeGreaterThanOrEqual(3);
			expect(keys?.some((k) => k.id === key1?.id)).toBe(true);
			expect(keys?.some((k) => k.id === key2?.id)).toBe(true);
			expect(keys?.some((k) => k.id === key3?.id)).toBe(true);

			// Delete one key
			await client.apiKey.delete({ keyId: key2!.id }, { headers: headers });

			// List should now have one less key
			const { data: keysAfterDelete } = await client.apiKey.list({
				fetchOptions: { headers: headers },
			});

			expect(keysAfterDelete?.length).toBe(keys!.length - 1);
			expect(keysAfterDelete?.some((k) => k.id === key2?.id)).toBe(false);
		});
	});

	describe("secondary-storage-with-fallback", async () => {
		let store = new Map<string, string>();
		const expirationMap = new Map<string, number>();

		const { client, auth, signInWithTestUser } = await getTestInstance(
			{
				secondaryStorage: {
					set(key, value, ttl) {
						store.set(key, value);
						if (ttl) expirationMap.set(key, ttl);
					},
					get(key) {
						return store.get(key) || null;
					},
					delete(key) {
						store.delete(key);
						expirationMap.delete(key);
					},
				},
				plugins: [
					apiKey({
						storage: "secondary-storage",
						fallbackToDatabase: true,
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

		beforeEach(() => {
			store.clear();
			expirationMap.clear();
		});

		it("should read from secondary storage first", async () => {
			const { headers, user } = await signInWithTestUser();
			const { data: createdKey } = await client.apiKey.create(
				{},
				{ headers: headers },
			);

			expect(createdKey).not.toBeNull();
			expect(store.has(`api-key:by-id:${createdKey!.id}`)).toBe(true);

			const { data: retrievedKey } = await client.apiKey.get(
				{ query: { id: createdKey!.id } },
				{ headers: headers },
			);

			expect(retrievedKey).not.toBeNull();
			expect(retrievedKey?.id).toBe(createdKey?.id);
		});

		it("should fallback to database when not found in storage and auto-populate storage", async () => {
			const { headers, user } = await signInWithTestUser();

			// Create key directly in database adapter (bypassing storage)
			const context = await auth.$context;
			const hashedKey = "test_hashed_key_123";
			const dbKey = await context.adapter.create<Omit<ApiKey, "id">, ApiKey>({
				model: "apikey",
				data: {
					createdAt: new Date(),
					updatedAt: new Date(),
					name: "Test Key",
					prefix: "test",
					start: "test_",
					key: hashedKey,
					enabled: true,
					expiresAt: null,
					userId: user.id,
					lastRefillAt: null,
					lastRequest: null,
					metadata: null,
					rateLimitMax: null,
					rateLimitTimeWindow: null,
					remaining: null,
					refillAmount: null,
					refillInterval: null,
					rateLimitEnabled: false,
					requestCount: 0,
					permissions: null,
				},
			});

			expect(dbKey).not.toBeNull();

			// Ensure key is NOT in storage initially
			expect(store.has(`api-key:by-id:${dbKey!.id}`)).toBe(false);
			expect(store.has(`api-key:${hashedKey}`)).toBe(false);

			// Retrieve it via API (should fallback to DB and auto-populate storage)
			const { data: retrievedKey } = await client.apiKey.get(
				{ query: { id: dbKey!.id } },
				{ headers: headers },
			);

			expect(retrievedKey).not.toBeNull();
			expect(retrievedKey?.id).toBe(dbKey?.id);

			// Verify it's now in storage (auto-populated)
			expect(store.has(`api-key:by-id:${dbKey!.id}`)).toBe(true);
			expect(store.has(`api-key:${hashedKey}`)).toBe(true);
		});

		it("should populate storage when listing keys falls back to database", async () => {
			const { headers, user } = await signInWithTestUser();

			// Create keys directly in database adapter (bypassing storage)
			const context = await auth.$context;
			const hashedKey1 = "test_hashed_key_1";
			const hashedKey2 = "test_hashed_key_2";

			const dbKey1 = await context.adapter.create<Omit<ApiKey, "id">, ApiKey>({
				model: "apikey",
				data: {
					createdAt: new Date(),
					updatedAt: new Date(),
					name: "Test Key 1",
					prefix: "test",
					start: "test_",
					key: hashedKey1,
					enabled: true,
					expiresAt: null,
					userId: user.id,
					lastRefillAt: null,
					lastRequest: null,
					metadata: null,
					rateLimitMax: null,
					rateLimitTimeWindow: null,
					remaining: null,
					refillAmount: null,
					refillInterval: null,
					rateLimitEnabled: false,
					requestCount: 0,
					permissions: null,
				},
			});

			const dbKey2 = await context.adapter.create<Omit<ApiKey, "id">, ApiKey>({
				model: "apikey",
				data: {
					createdAt: new Date(),
					updatedAt: new Date(),
					name: "Test Key 2",
					prefix: "test",
					start: "test_",
					key: hashedKey2,
					enabled: true,
					expiresAt: null,
					userId: user.id,
					lastRefillAt: null,
					lastRequest: null,
					metadata: null,
					rateLimitMax: null,
					rateLimitTimeWindow: null,
					remaining: null,
					refillAmount: null,
					refillInterval: null,
					rateLimitEnabled: false,
					requestCount: 0,
					permissions: null,
				},
			});

			expect(dbKey1).not.toBeNull();
			expect(dbKey2).not.toBeNull();

			// Ensure keys are NOT in storage initially
			expect(store.has(`api-key:by-id:${dbKey1!.id}`)).toBe(false);
			expect(store.has(`api-key:by-id:${dbKey2!.id}`)).toBe(false);
			expect(store.has(`api-key:by-user:${user.id}`)).toBe(false);

			// List keys via API (should fallback to DB and auto-populate storage)
			const { data: keys } = await client.apiKey.list({}, { headers: headers });

			expect(keys).not.toBeNull();
			expect(keys?.length).toBeGreaterThanOrEqual(2);
			expect(keys?.some((k) => k.id === dbKey1!.id)).toBe(true);
			expect(keys?.some((k) => k.id === dbKey2!.id)).toBe(true);

			// Verify keys are now in storage (auto-populated)
			expect(store.has(`api-key:by-id:${dbKey1!.id}`)).toBe(true);
			expect(store.has(`api-key:by-id:${dbKey2!.id}`)).toBe(true);
			expect(store.has(`api-key:${hashedKey1}`)).toBe(true);
			expect(store.has(`api-key:${hashedKey2}`)).toBe(true);
			// Verify user's key list is populated
			expect(store.has(`api-key:by-user:${user.id}`)).toBe(true);
		});

		it("should write to secondary storage only", async () => {
			const { headers, user } = await signInWithTestUser();
			const { data: createdKey } = await client.apiKey.create(
				{ name: "Test Key" },
				{ headers: headers },
			);

			expect(createdKey).not.toBeNull();
			expect(store.has(`api-key:by-id:${createdKey!.id}`)).toBe(true);
		});

		it("should create in both database and secondary storage when fallbackToDatabase is true", async () => {
			const { headers, user } = await signInWithTestUser();
			const { data: createdKey } = await client.apiKey.create(
				{ name: "Fallback Test Key" },
				{ headers: headers },
			);

			expect(createdKey).not.toBeNull();

			// Should be in secondary storage
			expect(store.has(`api-key:by-id:${createdKey!.id}`)).toBe(true);

			// Should also be in database (verify by direct DB query)
			const dbKey = await auth.api.getApiKey({
				query: { id: createdKey!.id },
				headers,
			});
			expect(dbKey).not.toBeNull();
			expect(dbKey?.id).toBe(createdKey?.id);
			expect(dbKey?.name).toBe("Fallback Test Key");
		});

		it("should update both database and secondary storage when fallbackToDatabase is true", async () => {
			const { headers, user } = await signInWithTestUser();
			const { data: createdKey } = await client.apiKey.create(
				{ name: "Original Name" },
				{ headers: headers },
			);

			expect(createdKey).not.toBeNull();

			// Update the key
			const { data: updatedKey } = await client.apiKey.update(
				{
					keyId: createdKey!.id,
					name: "Updated Name",
				},
				{ headers: headers },
			);

			expect(updatedKey).not.toBeNull();
			expect(updatedKey?.name).toBe("Updated Name");

			// Verify secondary storage is updated
			const cachedData = store.get(`api-key:by-id:${createdKey!.id}`);
			expect(cachedData).toBeDefined();
			const parsed = JSON.parse(cachedData!);
			expect(parsed.name).toBe("Updated Name");

			// Verify database is updated
			const dbKey = await auth.api.getApiKey({
				query: { id: createdKey!.id },
				headers,
			});
			expect(dbKey?.name).toBe("Updated Name");
		});

		it("should delete from both database and secondary storage when fallbackToDatabase is true", async () => {
			const { headers, user } = await signInWithTestUser();
			const { data: createdKey } = await client.apiKey.create(
				{},
				{ headers: headers },
			);

			expect(createdKey).not.toBeNull();
			expect(store.has(`api-key:by-id:${createdKey!.id}`)).toBe(true);

			// Verify it exists in DB
			const dbKeyBefore = await auth.api.getApiKey({
				query: { id: createdKey!.id },
				headers,
			});
			expect(dbKeyBefore).not.toBeNull();

			// Delete the key
			const { data: deleteResult } = await client.apiKey.delete(
				{ keyId: createdKey!.id },
				{ headers: headers },
			);

			expect(deleteResult?.success).toBe(true);

			// Should be deleted from secondary storage
			expect(store.has(`api-key:by-id:${createdKey!.id}`)).toBe(false);

			// Should be deleted from database
			let error: any = null;
			try {
				await auth.api.getApiKey({
					query: { id: createdKey!.id },
					headers,
				});
			} catch (e) {
				error = e;
			}
			expect(error).not.toBeNull();
			expect(error.status).toBe("NOT_FOUND");
		});
	});

	describe("custom storage methods", async () => {
		let customStore = new Map<string, string>();
		let customGetCalled = false;
		let customSetCalled = false;
		let customDeleteCalled = false;

		const { client, auth, signInWithTestUser } = await getTestInstance(
			{
				// Don't provide global secondaryStorage
				plugins: [
					apiKey({
						storage: "secondary-storage",
						customStorage: {
							set(key, value, ttl) {
								customSetCalled = true;
								customStore.set(key, value);
							},
							get(key) {
								customGetCalled = true;
								return customStore.get(key) || null;
							},
							delete(key) {
								customDeleteCalled = true;
								customStore.delete(key);
							},
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

		beforeEach(() => {
			customStore.clear();
			customGetCalled = false;
			customSetCalled = false;
			customDeleteCalled = false;
		});

		it("should use custom storage methods instead of global secondaryStorage", async () => {
			const { headers, user } = await signInWithTestUser();
			const { data: createdKey } = await client.apiKey.create(
				{},
				{ headers: headers },
			);

			expect(createdKey).not.toBeNull();
			expect(customSetCalled).toBe(true);
			expect(customStore.has(`api-key:by-id:${createdKey!.id}`)).toBe(true);
		});

		it("should use custom get method", async () => {
			const { headers, user } = await signInWithTestUser();
			const { data: createdKey } = await client.apiKey.create(
				{},
				{ headers: headers },
			);

			expect(createdKey).not.toBeNull();
			customGetCalled = false;

			const { data: retrievedKey } = await client.apiKey.get(
				{ query: { id: createdKey!.id } },
				{ headers: headers },
			);

			expect(retrievedKey).not.toBeNull();
			expect(customGetCalled).toBe(true);
		});

		it("should use custom delete method", async () => {
			const { headers, user } = await signInWithTestUser();
			const { data: createdKey } = await client.apiKey.create(
				{},
				{ headers: headers },
			);

			expect(createdKey).not.toBeNull();
			customDeleteCalled = false;

			const { data: deleteResult } = await client.apiKey.delete(
				{ keyId: createdKey!.id },
				{ headers: headers },
			);

			expect(deleteResult?.success).toBe(true);
			expect(customDeleteCalled).toBe(true);
			expect(customStore.has(`api-key:by-id:${createdKey!.id}`)).toBe(false);
		});
	});
});
