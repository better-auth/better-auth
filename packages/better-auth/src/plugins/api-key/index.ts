import { base64Url } from "@better-auth/utils/base64";
import { createHash } from "@better-auth/utils/hash";
import { APIError, createAuthMiddleware } from "../../api";
import type { BetterAuthPlugin } from "../../types/plugins";
import { mergeSchema } from "../../db";
import { apiKeySchema } from "./schema";
import { getIp } from "../../utils/get-request-ip";
import { getDate } from "../../utils/date";
import type { ApiKey, ApiKeyOptions } from "./types";
import { createApiKeyRoutes } from "./routes";
import type { User } from "../../types";
import { z } from "zod";
import { createAuthEndpoint } from "../../api/auth-endpoint";
import { sessionMiddleware } from "../../api/session-middleware";

export const ERROR_CODES = {
	INVALID_METADATA_TYPE: "metadata must be an object or undefined",
	REFILL_AMOUNT_AND_INTERVAL_REQUIRED:
		"refillAmount is required when refillInterval is provided",
	REFILL_INTERVAL_AND_AMOUNT_REQUIRED:
		"refillInterval is required when refillAmount is provided",
	USER_BANNED: "User is banned",
	UNAUTHORIZED_SESSION: "Unauthorized or invalid session",
	KEY_NOT_FOUND: "API Key not found",
	KEY_DISABLED: "API Key is disabled",
	KEY_EXPIRED: "API Key has expired",
	USAGE_EXCEEDED: "API Key has reached its usage limit",
	KEY_NOT_RECOVERABLE: "API Key is not recoverable",
	EXPIRES_IN_IS_TOO_SMALL:
		"The expiresIn is smaller than the predefined minimum value.",
	EXPIRES_IN_IS_TOO_LARGE:
		"The expiresIn is larger than the predefined maximum value.",
	INVALID_REMAINING: "The remaining count is either too large or too small.",
	INVALID_PREFIX_LENGTH: "The prefix length is either too large or too small.",
	INVALID_NAME_LENGTH: "The name length is either too large or too small.",
	METADATA_DISABLED: "Metadata is disabled.",
	RATE_LIMIT_EXCEEDED: "Rate limit exceeded.",
	NO_VALUES_TO_UPDATE: "No values to update.",
	KEY_DISABLED_EXPIRATION: "Custom key expiration values are disabled.",
	INVALID_API_KEY: "Invalid API key.",
	INVALID_USER_ID_FROM_API_KEY: "The user id from the API key is invalid.",
	INVALID_API_KEY_GETTER_RETURN_TYPE:
		"API Key getter returned an invalid key type. Expected string.",
	SERVER_ONLY_PROPERTY:
		"The property you're trying to set can only be set from the server auth instance only.",
};

export const apiKey = (options?: ApiKeyOptions) => {
	const opts = {
		...options,
		apiKeyHeaders: options?.apiKeyHeaders ?? "x-api-key",
		defaultKeyLength: options?.defaultKeyLength || 64,
		maximumPrefixLength: options?.maximumPrefixLength ?? 32,
		minimumPrefixLength: options?.minimumPrefixLength ?? 1,
		maximumNameLength: options?.maximumNameLength ?? 32,
		minimumNameLength: options?.minimumNameLength ?? 1,
		enableMetadata: options?.enableMetadata ?? false,
		rateLimit: {
			enabled: options?.rateLimit?.enabled ?? true,
			timeWindow: options?.rateLimit?.timeWindow ?? 1000 * 60 * 60 * 24,
			maxRequests: options?.rateLimit?.maxRequests ?? 10,
		},
		keyExpiration: {
			defaultExpiresIn: options?.keyExpiration?.defaultExpiresIn ?? null,
			disableCustomExpiresTime:
				options?.keyExpiration?.disableCustomExpiresTime ?? false,
			maxExpiresIn: options?.keyExpiration?.maxExpiresIn ?? 365,
			minExpiresIn: options?.keyExpiration?.minExpiresIn ?? 1,
		},
		startingCharactersConfig: {
			shouldStore: options?.startingCharactersConfig?.shouldStore ?? true,
			charactersLength:
				options?.startingCharactersConfig?.charactersLength ?? 6,
		},
		disableSessionForAPIKeys: options?.disableSessionForAPIKeys ?? false,
	} satisfies ApiKeyOptions;

	const schema = mergeSchema(
		apiKeySchema({
			rateLimitMax: opts.rateLimit.maxRequests,
			timeWindow: opts.rateLimit.timeWindow,
		}),
		opts.schema,
	);

	const getter =
		opts.customAPIKeyGetter ||
		((ctx) => {
			if (Array.isArray(opts.apiKeyHeaders)) {
				for (const header of opts.apiKeyHeaders) {
					const value = ctx.headers?.get(header);
					if (value) {
						return value;
					}
				}
			} else {
				return ctx.headers?.get(opts.apiKeyHeaders);
			}
		});

	const keyGenerator =
		opts.customKeyGenerator ||
		(async (options: { length: number; prefix: string | undefined }) => {
			const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
			let apiKey = `${options.prefix || ""}`;
			for (let i = 0; i < options.length; i++) {
				const randomIndex = Math.floor(Math.random() * characters.length);
				apiKey += characters[randomIndex];
			}

			return apiKey;
		});

	const routes = createApiKeyRoutes({ keyGenerator, opts, schema });

	return {
		id: "api-key",
		$ERROR_CODES: ERROR_CODES,
		hooks: {
			before: [
				{
					matcher: (ctx) =>
						!!getter(ctx) && opts.disableSessionForAPIKeys === false,
					handler: createAuthMiddleware(async (ctx) => {
						const key = getter(ctx)!;

						if (typeof key !== "string") {
							throw new APIError("BAD_REQUEST", {
								message: ERROR_CODES.INVALID_API_KEY_GETTER_RETURN_TYPE,
							});
						}

						if (key.length < opts.defaultKeyLength) {
							// if the key is shorter than the default key length, than we know the key is invalid.
							// we can't check if the key is exactly equal to the default key length, because
							// a prefix may be added to the key.
							throw new APIError("FORBIDDEN", {
								message: ERROR_CODES.INVALID_API_KEY,
							});
						}

						if (
							opts.customAPIKeyValidator &&
							!opts.customAPIKeyValidator({ ctx, key })
						) {
							throw new APIError("FORBIDDEN", {
								message: ERROR_CODES.INVALID_API_KEY,
							});
						}

						const hash = await createHash("SHA-256").digest(
							new TextEncoder().encode(key),
						);
						const hashed = base64Url.encode(new Uint8Array(hash), {
							padding: false,
						});

						const apiKey = await ctx.context.adapter.findOne<ApiKey>({
							model: schema.apikey.modelName,
							where: [
								{
									field: "key",
									value: hashed,
								},
							],
						});

						if (!apiKey) {
							throw new APIError("UNAUTHORIZED", {
								message: ERROR_CODES.INVALID_API_KEY,
							});
						}
						let user: User;
						try {
							const userResult = await ctx.context.internalAdapter.findUserById(
								apiKey.userId,
							);
							if (!userResult) {
								throw new APIError("UNAUTHORIZED", {
									message: ERROR_CODES.INVALID_USER_ID_FROM_API_KEY,
								});
							}
							user = userResult;
						} catch (error) {
							throw error;
						}

						const session = {
							user,
							session: {
								id: apiKey.id,
								token: key,
								userId: user.id,
								userAgent: ctx.request?.headers.get("user-agent") ?? null,
								ipAddress: ctx.request
									? getIp(ctx.request, ctx.context.options)
									: null,
								createdAt: new Date(),
								updatedAt: new Date(),
								expiresAt:
									apiKey.expiresAt ||
									getDate(
										ctx.context.options.session?.expiresIn || 60 * 60 * 24 * 7, // 7 days
										"ms",
									),
							},
						};
						ctx.context.session = session;

						if (ctx.path === "/get-session") {
							return session;
						} else {
							return {
								context: ctx,
							};
						}
					}),
				},
			],
		},
		endpoints: {
			createApiKey: createAuthEndpoint(
				"/api-key/create",
				{
					method: "POST",
					body: z.object({
						name: z.string({ description: "Name of the Api Key" }).optional(),
						expiresIn: z
							.number({
								description: "Expiration time of the Api Key in seconds",
							})
							.min(1)
							.optional()
							.nullable()
							.default(null),

						userId: z.coerce
							.string({
								description:
									"User Id of the user that the Api Key belongs to. Useful for server-side only.",
							})
							.optional(),
						prefix: z
							.string({ description: "Prefix of the Api Key" })
							.regex(/^[a-zA-Z0-9_-]+$/, {
								message:
									"Invalid prefix format, must be alphanumeric and contain only underscores and hyphens.",
							})
							.optional(),
						remaining: z
							.number({
								description: "Remaining number of requests. Server side only",
							})
							.min(0)
							.optional()
							.nullable()
							.default(null),
						metadata: z.any({ description: "Metadata of the Api Key" }).optional(),
						refillAmount: z
							.number({
								description:
									"Amount to refill the remaining count of the Api Key. Server Only Property",
							})
							.min(1)
							.optional(),
						refillInterval: z
							.number({
								description:
									"Interval to refill the Api Key in milliseconds. Server Only Property.",
							})
							.optional(),
						rateLimitTimeWindow: z
							.number({
								description:
									"The duration in milliseconds where each request is counted. Once the `maxRequests` is reached, the request will be rejected until the `timeWindow` has passed, at which point the `timeWindow` will be reset. Server Only Property.",
							})
							.optional(),
						rateLimitMax: z
							.number({
								description:
									"Maximum amount of requests allowed within a window. Once the `maxRequests` is reached, the request will be rejected until the `timeWindow` has passed, at which point the `timeWindow` will be reset. Server Only Property.",
							})
							.optional(),
						rateLimitEnabled: z
							.boolean({
								description:
									"Whether the key has rate limiting enabled. Server Only Property.",
							})
							.optional(),
						permissions: z.record(z.string(), z.array(z.string())).optional(),
					}),
					metadata: {
						openapi: {
							operationId: "apiKeyCreate",
							description: "Create an API key",
							responses: {
								200: {
									description: "Success",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													id: {
														type: "string",
													},
													key: {
														type: "string",
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
			),
			verifyApiKey: createAuthEndpoint(
				"/api-key/verify",
				{
					method: "POST",
					body: z.object({
						key: z.string({
							description: "The key to verify",
						}),
						permissions: z.record(z.string(), z.array(z.string())).optional(),
					}),
					metadata: {
						SERVER_ONLY: true,
						openapi: {
							operationId: "apiKeyVerify",
							description: "Verify an API key",
							responses: {
								200: {
									description: "Success",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													valid: {
														type: "boolean",
													},
													error: {
														type: "object",
														properties: {
															message: {
																type: "string",
															},
															code: {
																type: "string",
															},
														},
													},
													key: {
														type: "object",
														properties: {
															id: {
																type: "string",
															},
														},
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
			),
			getApiKey: createAuthEndpoint(
				"/api-key/get",
				{
					method: "GET",
					query: z.object({
						id: z.string({
							description: "The id of the Api Key",
						}),
					}),
					use: [sessionMiddleware],
					metadata: {
						openapi: {
							operationId: "apiKeyGet",
							description: "Get an API key",
							responses: {
								200: {
									description: "Success",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													id: {
														type: "string",
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
			),
			updateApiKey: createAuthEndpoint(
				"/api-key/update",
				{
					method: "POST",
					body: z.object({
						id: z.string({
							description: "The id of the Api Key",
						}),
						name: z.string({ description: "Name of the Api Key" }).optional(),
						enabled: z.boolean({ description: "Enable/Disable the Api Key" }).optional(),
						metadata: z.any({ description: "Metadata of the Api Key" }).optional(),
					}),
					use: [sessionMiddleware],
					metadata: {
						openapi: {
							operationId: "apiKeyUpdate",
							description: "Update an API key",
							responses: {
								200: {
									description: "Success",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													id: {
														type: "string",
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
			),
			deleteApiKey: createAuthEndpoint(
				"/api-key/delete",
				{
					method: "POST",
					body: z.object({
						id: z.string({
							description: "The id of the Api Key",
						}),
					}),
					use: [sessionMiddleware],
					metadata: {
						openapi: {
							operationId: "apiKeyDelete",
							description: "Delete an API key",
							responses: {
								200: {
									description: "Success",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													success: {
														type: "boolean",
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
			),
			listApiKeys: createAuthEndpoint(
				"/api-key/list",
				{
					method: "GET",
					use: [sessionMiddleware],
					metadata: {
						openapi: {
							operationId: "apiKeyList",
							description: "List API keys",
							responses: {
								200: {
									description: "Success",
									content: {
										"application/json": {
											schema: {
												type: "array",
												items: {
													type: "object",
													properties: {
														id: {
															type: "string",
														},
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
			),
			deleteAllExpiredApiKeys: createAuthEndpoint(
				"/api-key/delete-all-expired-api-keys",
				{
					method: "POST",
					metadata: {
						SERVER_ONLY: true,
						openapi: {
							operationId: "apiKeyDeleteAllExpired",
							description: "Delete all expired API keys",
							responses: {
								200: {
									description: "Success",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													success: {
														type: "boolean",
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
			),
		},
		schema: schema,
	} satisfies BetterAuthPlugin;
};
