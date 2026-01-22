import type { BetterAuthPlugin } from "@better-auth/core";
import { createAuthMiddleware } from "@better-auth/core/api";
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

declare module "@better-auth/core" {
	// biome-ignore lint/correctness/noUnusedVariables: AuthOptions and Options need to be same as declared in the module
	interface BetterAuthPluginRegistry<AuthOptions, Options> {
		"api-key": {
			creator: typeof apiKey;
		};
	}
}

export const defaultKeyHasher = async (key: string) => {
	const hash = await createHash("SHA-256").digest(
		new TextEncoder().encode(key),
	);
	const hashed = base64Url.encode(new Uint8Array(hash), {
		padding: false,
	});
	return hashed;
};

import { API_KEY_ERROR_CODES } from "./error-codes";

export { API_KEY_ERROR_CODES } from "./error-codes";

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
		deferUpdates: options?.deferUpdates ?? false,
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
		$ERROR_CODES: API_KEY_ERROR_CODES,
		hooks: {
			before: [
				{
					matcher: (ctx) => !!getter(ctx) && opts.enableSessionForAPIKeys,
					handler: createAuthMiddleware(async (ctx) => {
						const key = getter(ctx)!;

						if (typeof key !== "string") {
							throw APIError.from(
								"BAD_REQUEST",
								API_KEY_ERROR_CODES.INVALID_API_KEY_GETTER_RETURN_TYPE,
							);
						}

						if (key.length < opts.defaultKeyLength) {
							// if the key is shorter than the default key length, than we know the key is invalid.
							// we can't check if the key is exactly equal to the default key length, because
							// a prefix may be added to the key.
							throw APIError.from(
								"FORBIDDEN",
								API_KEY_ERROR_CODES.INVALID_API_KEY,
							);
						}

						if (opts.customAPIKeyValidator) {
							const isValid = await opts.customAPIKeyValidator({ ctx, key });
							if (!isValid) {
								throw APIError.from(
									"FORBIDDEN",
									API_KEY_ERROR_CODES.INVALID_API_KEY,
								);
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

						const cleanupTask = deleteAllExpiredApiKeys(ctx.context).catch(
							(err) => {
								ctx.context.logger.error(
									"Failed to delete expired API keys:",
									err,
								);
							},
						);
						if (opts.deferUpdates) {
							ctx.context.runInBackground(cleanupTask);
						}

						const user = await ctx.context.internalAdapter.findUserById(
							apiKey.userId,
						);
						if (!user) {
							throw APIError.from(
								"UNAUTHORIZED",
								API_KEY_ERROR_CODES.INVALID_USER_ID_FROM_API_KEY,
							);
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
		options,
	} satisfies BetterAuthPlugin;
};

export type * from "./types";
