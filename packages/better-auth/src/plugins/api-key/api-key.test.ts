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
					// events({ event, success, user, apiKey, error_code, error_message }) {
					// 	console.log({
					// 		event,
					// 		success,
					// 		user,
					// 		apiKey,
					// 		error_code,
					// 		error_message,
					// 	});
					// },
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
	const { headers: headers2, user: user2 } = await signInWithTestUser();

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

	it("should get an API key by its ID", async () => {
		const apiKey = await auth.api.getApiKey({
			body: {
				id: firstApiKey.id,
			},
			headers,
		});

        console.log(apiKey)

		expect(apiKey).not.toBeNull();
        expect(apiKey.key).toBeUndefined();
        expect(apiKey.id).toEqual(firstApiKey.id);
        expect(apiKey.userId).toEqual(firstApiKey.userId);
	});



    it("should fail to get that key if it's by a different owner", async () => {
        const apiKey = await auth.api.getApiKey({
			body: {
				id: firstApiKey.id,
			},
			headers: headers2,
		});

        console.log(apiKey);
        console.log(user2)
        console.log(user)
    })
});
