import type { SecondaryStorage } from "@better-auth/core/db";
import { APIError } from "@better-auth/core/error";
import type { Auth } from "better-auth";
import { getTestInstance } from "better-auth/test";
import { beforeAll, describe, expect, expectTypeOf, it, vi } from "vitest";
import { apiKey } from "..";
import { apiKeyClient } from "../client";

describe("API key verification failures", () => {
	let auth: Auth<{ plugins: [ReturnType<typeof apiKey>] }>;
	let userId: string;

	beforeAll(async () => {
		const instance = await getTestInstance(
			{ plugins: [apiKey()] },
			{ clientOptions: { plugins: [apiKeyClient()] } },
		);
		auth = instance.auth;
		userId = (await instance.signInWithTestUser()).user.id;
	});

	it.each([
		"findOne",
		"update",
		"incrementOne",
	] as const)("distinguishes database %s failures from invalid keys", async (operation) => {
		const created = await auth.api.createApiKey({
			body: { userId, remaining: 3 },
		});
		const context = await auth.$context;
		const failure = new Error(
			"Connection terminated due to connection timeout",
		);
		const logError = vi
			.spyOn(context.logger, "error")
			.mockImplementation(() => {});
		const databaseOperation = vi
			.spyOn(context.adapter, operation)
			.mockRejectedValueOnce(failure);

		const verification = auth.api.verifyApiKey({
			body: { key: created.key },
		});

		await expect(verification).rejects.toBeInstanceOf(APIError);
		await expect(verification).rejects.toHaveProperty("cause", failure);
		await expect(verification).rejects.toMatchObject({
			status: "INTERNAL_SERVER_ERROR",
			statusCode: 500,
			body: {
				message: "Internal error during API key verification.",
			},
		});
		expect(logError).toHaveBeenCalledWith(
			"Failed to validate API key:",
			failure,
		);
		expect(databaseOperation).toHaveBeenCalledTimes(1);

		databaseOperation.mockRestore();
		const recovered = await auth.api.verifyApiKey({
			body: { key: created.key },
		});
		expect(recovered.valid).toBe(true);
	});

	it("keeps missing keys distinguishable from verification failures", async () => {
		const context = await auth.$context;
		const logError = vi
			.spyOn(context.logger, "error")
			.mockImplementation(() => {});
		const result = await auth.api.verifyApiKey({
			body: { key: "missing-api-key" },
		});

		expect(result.valid).toBe(false);
		expect(result.error?.code).toBe("INVALID_API_KEY");
		expect(result.key).toBeNull();
		expect(logError).not.toHaveBeenCalled();
		if (!result.valid) {
			expectTypeOf(result.key).toEqualTypeOf<null>();
			expectTypeOf(result.error.message).toEqualTypeOf<string>();
		}
	});

	it("preserves explicit API authentication rejection results", async () => {
		const failure = APIError.from("UNAUTHORIZED", {
			code: "KEY_DISABLED",
			message: "Explicit verification error",
		});
		const context = await auth.$context;
		vi.spyOn(context.adapter, "findOne").mockRejectedValueOnce(failure);

		const result = await auth.api.verifyApiKey({
			body: { key: "test-api-key" },
		});
		expect(result).toEqual({ valid: false, error: failure.body, key: null });
	});

	it.each([
		"BAD_REQUEST",
		"FORBIDDEN",
		"TOO_MANY_REQUESTS",
	] as const)("preserves existing %s rejection results", async (status) => {
		const failure = APIError.from(status, {
			code: "REQUEST_REJECTED",
			message: "Explicit client error",
		});
		const context = await auth.$context;
		vi.spyOn(context.adapter, "findOne").mockRejectedValueOnce(failure);

		const result = await auth.api.verifyApiKey({
			body: { key: "test-api-key" },
		});
		expect(result).toEqual({ valid: false, error: failure.body, key: null });
	});

	it.each([
		"INTERNAL_SERVER_ERROR",
		"SERVICE_UNAVAILABLE",
		"GATEWAY_TIMEOUT",
	] as const)("propagates explicit %s API errors unchanged", async (status) => {
		const failure = APIError.from(status, {
			code: "STORAGE_UNAVAILABLE",
			message: "Explicit storage error",
		});
		const context = await auth.$context;
		vi.spyOn(context.adapter, "findOne").mockRejectedValueOnce(failure);

		await expect(
			auth.api.verifyApiKey({ body: { key: "test-api-key" } }),
		).rejects.toBe(failure);
	});

	it("serializes unexpected errors as HTTP 500 without storage details", async () => {
		const context = await auth.$context;
		const failure = new Error(
			"Database connection timed out: private storage details",
		);
		vi.spyOn(context.adapter, "findOne").mockRejectedValueOnce(failure);

		const response = await auth.api.verifyApiKey({
			body: { key: "test-api-key" },
			asResponse: true,
		});

		expect(response.status).toBe(500);
		expect(await response.json()).toEqual({
			message: "Internal error during API key verification.",
		});
	});

	it("preserves HTTP 503 and retry headers from an explicit service error", async () => {
		const context = await auth.$context;
		const failure = new APIError(
			"SERVICE_UNAVAILABLE",
			{
				code: "STORAGE_UNAVAILABLE",
				message: "Storage temporarily unavailable",
			},
			{ "retry-after": "5" },
		);
		vi.spyOn(context.adapter, "findOne").mockRejectedValueOnce(failure);

		const response = await auth.api.verifyApiKey({
			body: { key: "test-api-key" },
			asResponse: true,
		});

		expect(response.status).toBe(503);
		expect(response.headers.get("retry-after")).toBe("5");
		expect(await response.json()).toEqual(failure.body);
	});

	it.each([
		"get",
		"set",
	] as const)("distinguishes secondary storage %s failures from invalid keys", async (operation) => {
		const store = new Map<string, string>();
		const storage = {
			get: vi.fn(async (key: string) => store.get(key) ?? null),
			getAndDelete(key) {
				const value = store.get(key) ?? null;
				store.delete(key);
				return value;
			},
			increment(key) {
				const count = Number(store.get(key) ?? 0) + 1;
				store.set(key, String(count));
				return count;
			},
			set: vi.fn(async (key: string, value: string) => {
				store.set(key, value);
			}),
			delete: async (key) => {
				store.delete(key);
			},
		} satisfies SecondaryStorage;
		const { auth: storageAuth, signInWithTestUser: signInStorageUser } =
			await getTestInstance({
				plugins: [
					apiKey({
						storage: "secondary-storage",
						customStorage: storage,
					}),
				],
			});
		const { user: storageUser } = await signInStorageUser();
		const created = await storageAuth.api.createApiKey({
			body: { userId: storageUser.id },
		});
		const failure = new Error("Secondary storage connection timed out");
		storage.get.mockClear();
		storage.set.mockClear();
		storage[operation].mockRejectedValueOnce(failure);

		await expect(
			storageAuth.api.verifyApiKey({ body: { key: created.key } }),
		).rejects.toMatchObject({
			status: "INTERNAL_SERVER_ERROR",
			statusCode: 500,
			cause: failure,
		});
		expect(storage.get).toHaveBeenCalled();
		expect(storage[operation]).toHaveBeenCalled();
	});

	it("reports database write failures even when the secondary storage lookup succeeds", async () => {
		const store = new Map<string, string>();
		const { auth: cachedAuth, signInWithTestUser: signInCachedUser } =
			await getTestInstance({
				plugins: [
					apiKey({
						storage: "secondary-storage",
						fallbackToDatabase: true,
						customStorage: {
							get: async (key) => store.get(key) ?? null,
							getAndDelete(key) {
								const value = store.get(key) ?? null;
								store.delete(key);
								return value;
							},
							increment(key) {
								const count = Number(store.get(key) ?? 0) + 1;
								store.set(key, String(count));
								return count;
							},
							set: async (key, value) => {
								store.set(key, value);
							},
							delete: async (key) => {
								store.delete(key);
							},
						},
					}),
				],
			});
		const { user: cachedUser } = await signInCachedUser();
		const created = await cachedAuth.api.createApiKey({
			body: { userId: cachedUser.id },
		});
		const context = await cachedAuth.$context;
		const databaseRead = vi.spyOn(context.adapter, "findOne");
		vi.spyOn(context.adapter, "update").mockRejectedValueOnce(
			new Error("Database write timed out"),
		);

		await expect(
			cachedAuth.api.verifyApiKey({ body: { key: created.key } }),
		).rejects.toMatchObject({
			status: "INTERNAL_SERVER_ERROR",
			statusCode: 500,
		});

		expect(databaseRead).not.toHaveBeenCalled();
	});

	it("preserves disabled key rejections", async () => {
		const created = await auth.api.createApiKey({ body: { userId } });
		const context = await auth.$context;
		await context.adapter.update({
			model: "apikey",
			where: [{ field: "id", value: created.id }],
			update: { enabled: false },
		});

		const result = await auth.api.verifyApiKey({ body: { key: created.key } });

		expect(result.valid).toBe(false);
		expect(result.error?.code).toBe("KEY_DISABLED");
	});

	it("preserves rate limit rejections", async () => {
		const created = await auth.api.createApiKey({
			body: { userId, rateLimitMax: 1, rateLimitTimeWindow: 60_000 },
		});
		const accepted = await auth.api.verifyApiKey({
			body: { key: created.key },
		});
		const rejected = await auth.api.verifyApiKey({
			body: { key: created.key },
		});

		expect(accepted.valid).toBe(true);
		if (accepted.valid) {
			expectTypeOf(accepted.error).toEqualTypeOf<null>();
			expectTypeOf(accepted.key).not.toBeNullable();
		}
		expect(rejected.valid).toBe(false);
		expect(rejected.error?.code).toBe("RATE_LIMITED");
		expect(rejected.error).toMatchObject({
			details: { tryAgainIn: expect.any(Number) },
		});
	});

	it.each([
		undefined,
		"default",
	])("keeps custom validator rejection separate from execution failure for config %s", async (configId) => {
		const customAPIKeyValidator = vi.fn(async () => true);
		const { auth: customAuth, signInWithTestUser: signInCustomUser } =
			await getTestInstance({ plugins: [apiKey({ customAPIKeyValidator })] });
		const { user: customUser } = await signInCustomUser();
		const created = await customAuth.api.createApiKey({
			body: { userId: customUser.id },
		});
		customAPIKeyValidator.mockResolvedValueOnce(false);

		const rejected = await customAuth.api.verifyApiKey({
			body: { key: created.key, configId },
		});

		expect(rejected.valid).toBe(false);
		expect(rejected.error?.code).toBe("KEY_NOT_FOUND");
		expect(rejected.key).toBeNull();

		const failure = APIError.from("SERVICE_UNAVAILABLE", {
			code: "VALIDATION_UNAVAILABLE",
			message: "Custom validation service failed",
		});
		customAPIKeyValidator.mockRejectedValueOnce(failure);
		await expect(
			customAuth.api.verifyApiKey({ body: { key: created.key, configId } }),
		).rejects.toBe(failure);

		const unexpected = new Error("Custom validation service unavailable");
		customAPIKeyValidator.mockRejectedValueOnce(unexpected);
		await expect(
			customAuth.api.verifyApiKey({ body: { key: created.key, configId } }),
		).rejects.toMatchObject({
			status: "INTERNAL_SERVER_ERROR",
			cause: unexpected,
		});
	});
});

describe("API key session validation", () => {
	let auth: Auth<{ plugins: [ReturnType<typeof apiKey>] }>;
	let client: Awaited<ReturnType<typeof getTestInstance>>["client"];
	let userId: string;

	beforeAll(async () => {
		const instance = await getTestInstance(
			{ plugins: [apiKey({ enableSessionForAPIKeys: true })] },
			{ clientOptions: { plugins: [apiKeyClient()] } },
		);
		auth = instance.auth;
		client = instance.client;
		userId = (await instance.signInWithTestUser()).user.id;
	});

	it("converts a missing key decision to HTTP 401", async () => {
		const result = await client.getSession({
			fetchOptions: { headers: { "x-api-key": "x".repeat(64) } },
		});

		expect(result.error?.status).toBe(401);
		expect(result.error?.code).toBe("INVALID_API_KEY");
	});

	it("converts a rate limit decision to HTTP 429 with retry details", async () => {
		const created = await auth.api.createApiKey({
			body: { userId, rateLimitMax: 1, rateLimitTimeWindow: 60_000 },
		});
		const fetchOptions = { headers: { "x-api-key": created.key } };
		const accepted = await client.getSession({ fetchOptions });
		const rejected = await client.getSession({ fetchOptions });

		expect(accepted.data?.user.id).toBe(userId);
		expect(rejected.error?.status).toBe(429);
		expect(rejected.error?.code).toBe("RATE_LIMITED");
		expect(rejected.error).toMatchObject({
			details: { tryAgainIn: expect.any(Number) },
		});
	});

	it("normalizes unexpected storage failures for server and HTTP calls", async () => {
		const created = await auth.api.createApiKey({ body: { userId } });
		const context = await auth.$context;
		vi.spyOn(context.adapter, "findOne").mockRejectedValue(
			new Error("Database unavailable"),
		);
		const headers = new Headers({ "x-api-key": created.key });

		await expect(auth.api.getSession({ headers })).rejects.toMatchObject({
			status: "INTERNAL_SERVER_ERROR",
			statusCode: 500,
		});
		const result = await client.getSession({ fetchOptions: { headers } });
		expect(result.error?.status).toBe(500);
		expect(result.error?.message).not.toContain("Database unavailable");
	});

	it("preserves custom rejection and normalizes callback failures", async () => {
		const customAPIKeyValidator = vi.fn(async () => true);
		const {
			auth: customAuth,
			client: customClient,
			signInWithTestUser: signInCustomUser,
		} = await getTestInstance(
			{
				plugins: [
					apiKey({ enableSessionForAPIKeys: true, customAPIKeyValidator }),
				],
			},
			{ clientOptions: { plugins: [apiKeyClient()] } },
		);
		const { user: customUser } = await signInCustomUser();
		const created = await customAuth.api.createApiKey({
			body: { userId: customUser.id },
		});
		const headers = new Headers({ "x-api-key": created.key });
		customAPIKeyValidator.mockResolvedValueOnce(false);

		const rejected = await customClient.getSession({
			fetchOptions: { headers },
		});
		expect(rejected.error?.status).toBe(403);
		expect(rejected.error?.code).toBe("INVALID_API_KEY");

		const failure = new Error("Custom validation service unavailable");
		customAPIKeyValidator.mockRejectedValueOnce(failure);
		await expect(customAuth.api.getSession({ headers })).rejects.toMatchObject({
			status: "INTERNAL_SERVER_ERROR",
			cause: failure,
		});
	});
});
