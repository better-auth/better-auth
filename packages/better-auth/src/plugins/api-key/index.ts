import type { BetterAuthPlugin } from "@better-auth/core";
import { createAuthMiddleware } from "@better-auth/core/api";
import { defineErrorCodes } from "@better-auth/core/utils";
import { base64Url } from "@better-auth/utils/base64";
import { createHash } from "@better-auth/utils/hash";
import { APIError } from "../../api";
import { generateRandomString } from "../../crypto/random";
import { mergeSchema } from "../../db";
import { getDate } from "../../utils/date";
import { getIp } from "../../utils/get-request-ip";
import { createApiKeyRoutes, deleteAllExpiredApiKeys } from "./routes";
import { validateApiKey } from "./routes/verify-api-key";
import { apiKeySchema } from "./schema";
import type { ApiKeyOptions } from "./types";

export const defaultKeyHasher = async (key: string) => {
	const hash = await createHash("SHA-256").digest(
		new TextEncoder().encode(key),
	);
	const hashed = base64Url.encode(new Uint8Array(hash), {
		padding: false,
	});
	return hashed;
};

export const ERROR_CODES = defineErrorCodes({
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
	FAILED_TO_UPDATE_API_KEY: "Failed to update API key",
	NAME_REQUIRED: "API Key name is required.",
});

export const API_KEY_TABLE_NAME = "apikey";

export const apiKey = (options?: ApiKeyOptions | undefined) => {
	const opts = {
		...options,
		apiKeyHeaders: options?.apiKeyHeaders ?? "x-api-key",
		defaultKeyLength: options?.defaultKeyLength || 64,
		maximumPrefixLength: options?.maximumPrefixLength ?? 32,
		minimumPrefixLength: options?.minimumPrefixLength ?? 1,
		maximumNameLength: options?.maximumNameLength ?? 32,
		minimumNameLength: options?.minimumNameLength ?? 1,
		enableMetadata: options?.enableMetadata ?? false,
		disableKeyHashing: options?.disableKeyHashing ?? false,
		requireName: options?.requireName ?? false,
		storage: options?.storage ?? "database",
		rateLimit: {
			enabled:
				options?.rateLimit?.enabled === undefined
					? true
					: options?.rateLimit?.enabled,
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
		enableSessionForAPIKeys: options?.enableSessionForAPIKeys ?? false,
		fallbackToDatabase: options?.fallbackToDatabase ?? false,
		customStorage: options?.customStorage,
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
			const key = generateRandomString(options.length, "a-z", "A-Z");
			return `${options.prefix || ""}${key}`;
		});

	const routes = createApiKeyRoutes({ keyGenerator, opts, schema });

	return {
		id: "api-key",
		$ERROR_CODES: ERROR_CODES,
		hooks: {
			before: [
				{
					matcher: (ctx) => !!getter(ctx) && opts.enableSessionForAPIKeys,
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

						if (opts.customAPIKeyValidator) {
							const isValid = await opts.customAPIKeyValidator({ ctx, key });
							if (!isValid) {
								throw new APIError("FORBIDDEN", {
									message: ERROR_CODES.INVALID_API_KEY,
								});
							}
						}

						const hashed = opts.disableKeyHashing
							? key
							: await defaultKeyHasher(key);

						const apiKey = await validateApiKey({
							hashedKey: hashed,
							ctx,
							opts,
							schema,
						});

						//for cleanup purposes
						deleteAllExpiredApiKeys(ctx.context).catch((err) => {
							ctx.context.logger.error(
								"Failed to delete expired API keys:",
								err,
							);
						});

						const user = await ctx.context.internalAdapter.findUserById(
							apiKey.userId,
						);
						if (!user) {
							throw new APIError("UNAUTHORIZED", {
								message: ERROR_CODES.INVALID_USER_ID_FROM_API_KEY,
							});
						}

						const session = {
							user,
							session: {
								id: apiKey.id,
								token: key,
								userId: apiKey.userId,
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

						// Always set the session context for API key authentication
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
			/**
			 * ### Endpoint
			 *
			 * POST `/api-key/create`
			 *
			 * ### API Methods
			 *
			 * **server:**
			 * `auth.api.createApiKey`
			 *
			 * **client:**
			 * `authClient.apiKey.create`
			 *
			 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/api-key#api-method-api-key-create)
			 */
			createApiKey: routes.createApiKey,
			/**
			 * ### Endpoint
			 *
			 * POST `/api-key/verify`
			 *
			 * ### API Methods
			 *
			 * **server:**
			 * `auth.api.verifyApiKey`
			 *
			 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/api-key#api-method-api-key-verify)
			 */
			verifyApiKey: routes.verifyApiKey,
			/**
			 * ### Endpoint
			 *
			 * GET `/api-key/get`
			 *
			 * ### API Methods
			 *
			 * **server:**
			 * `auth.api.getApiKey`
			 *
			 * **client:**
			 * `authClient.apiKey.get`
			 *
			 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/api-key#api-method-api-key-get)
			 */
			getApiKey: routes.getApiKey,
			/**
			 * ### Endpoint
			 *
			 * POST `/api-key/update`
			 *
			 * ### API Methods
			 *
			 * **server:**
			 * `auth.api.updateApiKey`
			 *
			 * **client:**
			 * `authClient.apiKey.update`
			 *
			 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/api-key#api-method-api-key-update)
			 */
			updateApiKey: routes.updateApiKey,
			/**
			 * ### Endpoint
			 *
			 * POST `/api-key/delete`
			 *
			 * ### API Methods
			 *
			 * **server:**
			 * `auth.api.deleteApiKey`
			 *
			 * **client:**
			 * `authClient.apiKey.delete`
			 *
			 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/api-key#api-method-api-key-delete)
			 */
			deleteApiKey: routes.deleteApiKey,
			/**
			 * ### Endpoint
			 *
			 * GET `/api-key/list`
			 *
			 * ### API Methods
			 *
			 * **server:**
			 * `auth.api.listApiKeys`
			 *
			 * **client:**
			 * `authClient.apiKey.list`
			 *
			 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/api-key#api-method-api-key-list)
			 */
			listApiKeys: routes.listApiKeys,
			/**
			 * ### Endpoint
			 *
			 * POST `/api-key/delete-all-expired-api-keys`
			 *
			 * ### API Methods
			 *
			 * **server:**
			 * `auth.api.deleteAllExpiredApiKeys`
			 *
			 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/api-key#api-method-api-key-delete-all-expired-api-keys)
			 */
			deleteAllExpiredApiKeys: routes.deleteAllExpiredApiKeys,
		},
		schema,
	} satisfies BetterAuthPlugin;
};

export type * from "./types";
