import type { BetterAuthPlugin, HookEndpointContext } from "@better-auth/core";
import { createAuthMiddleware } from "@better-auth/core/api";
import { base64Url } from "@better-auth/utils/base64";
import { createHash } from "@better-auth/utils/hash";
import { BetterAuthError } from "better-auth";
import { APIError } from "better-auth/api";
import { generateRandomString } from "better-auth/crypto";
import { mergeSchema } from "better-auth/db";
import { API_KEY_ERROR_CODES } from "./error-codes";
import type { PredefinedApiKeyOptions } from "./routes";
import { createApiKeyRoutes, deleteAllExpiredApiKeys } from "./routes";
import { validateApiKey } from "./routes/verify-api-key";
import { apiKeySchema } from "./schema";
import type { ApiKeyConfigurationOptions, ApiKeyOptions } from "./types";
import { getDate, getIp } from "./utils";

declare module "@better-auth/core" {
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

export { API_KEY_ERROR_CODES } from "./error-codes";

export const API_KEY_TABLE_NAME = "apikey";

export function apiKey(
	_configurations?:
		| (ApiKeyConfigurationOptions & ApiKeyOptions)
		| ApiKeyConfigurationOptions[]
		| undefined,
	_options?: ApiKeyOptions | undefined,
) {
	if (Array.isArray(_configurations) && _configurations.length > 0) {
		if (!_configurations.every((option) => option.configId)) {
			throw new BetterAuthError(
				"configId is required for each API key configuration in the api-key plugin.",
			);
		}
		const configIds = _configurations.map((option) => option.configId);
		if (new Set(configIds).size !== configIds.length) {
			throw new BetterAuthError(
				"configId must be unique for each API key configuration in the api-key plugin.",
			);
		}
	}

	const options: ApiKeyOptions = _options ?? {
		schema: Array.isArray(_configurations)
			? undefined
			: (_configurations as ApiKeyOptions | undefined)?.schema,
	};

	const configurations = [
		...(Array.isArray(_configurations)
			? _configurations
			: [_configurations]
		).map((config) => ({
			...config,
			apiKeyHeaders: config?.apiKeyHeaders ?? "x-api-key",
			defaultKeyLength: config?.defaultKeyLength || 64,
			maximumPrefixLength: config?.maximumPrefixLength ?? 32,
			minimumPrefixLength: config?.minimumPrefixLength ?? 1,
			maximumNameLength: config?.maximumNameLength ?? 32,
			minimumNameLength: config?.minimumNameLength ?? 1,
			enableMetadata: config?.enableMetadata ?? false,
			disableKeyHashing: config?.disableKeyHashing ?? false,
			requireName: config?.requireName ?? false,
			storage: config?.storage ?? "database",
			rateLimit: {
				enabled:
					config?.rateLimit?.enabled === undefined
						? true
						: config?.rateLimit?.enabled,
				timeWindow: config?.rateLimit?.timeWindow ?? 1000 * 60 * 60 * 24,
				maxRequests: config?.rateLimit?.maxRequests ?? 10,
			},
			keyExpiration: {
				defaultExpiresIn: config?.keyExpiration?.defaultExpiresIn ?? null,
				disableCustomExpiresTime:
					config?.keyExpiration?.disableCustomExpiresTime ?? false,
				maxExpiresIn: config?.keyExpiration?.maxExpiresIn ?? 365,
				minExpiresIn: config?.keyExpiration?.minExpiresIn ?? 1,
			},
			startingCharactersConfig: {
				shouldStore: config?.startingCharactersConfig?.shouldStore ?? true,
				charactersLength:
					config?.startingCharactersConfig?.charactersLength ?? 6,
			},
			enableSessionForAPIKeys: config?.enableSessionForAPIKeys ?? false,
			fallbackToDatabase: config?.fallbackToDatabase ?? false,
			customStorage: config?.customStorage,
			deferUpdates: config?.deferUpdates ?? false,
		})),
	] as PredefinedApiKeyOptions[];

	const schema = mergeSchema(
		apiKeySchema({
			defaultRateLimitMax:
				(configurations.length === 1
					? configurations[0]?.rateLimit.maxRequests
					: undefined) ?? 10,
			defaultTimeWindow:
				(configurations.length === 1
					? configurations[0]?.rateLimit.timeWindow
					: undefined) ?? 1000 * 60 * 60 * 24,
		}),
		options.schema,
	);

	const defaultKeyGenerator = async (opts: {
		length: number;
		prefix: string | undefined;
	}) => {
		const key = generateRandomString(opts.length, "a-z", "A-Z");
		return `${opts.prefix || ""}${key}`;
	};

	function getApiKeyFromConfig(
		ctx: HookEndpointContext,
		config: PredefinedApiKeyOptions,
	): string | null | undefined {
		if (config.customAPIKeyGetter) {
			return config.customAPIKeyGetter(ctx);
		}
		if (Array.isArray(config.apiKeyHeaders)) {
			for (const header of config.apiKeyHeaders) {
				const value = ctx.headers?.get(header);
				if (value) return value;
			}
			return null;
		}
		return ctx.headers?.get(config.apiKeyHeaders) ?? null;
	}

	function findApiKeyAndConfig(ctx: HookEndpointContext) {
		for (const config of configurations) {
			if (!config.enableSessionForAPIKeys) continue;
			const key = getApiKeyFromConfig(ctx, config);
			if (key) return { key, config };
		}
		return null;
	}

	const routes = createApiKeyRoutes({
		defaultKeyGenerator,
		configurations,
		schema,
	});

	return {
		id: "api-key",
		$ERROR_CODES: API_KEY_ERROR_CODES,
		hooks: {
			before: [
				{
					matcher: (ctx) => !!findApiKeyAndConfig(ctx),
					handler: createAuthMiddleware(async (ctx) => {
						const result = findApiKeyAndConfig(ctx)!;
						const { key, config } = result;

						if (typeof key !== "string") {
							throw APIError.from(
								"BAD_REQUEST",
								API_KEY_ERROR_CODES.INVALID_API_KEY_GETTER_RETURN_TYPE,
							);
						}

						if (key.length < config.defaultKeyLength) {
							throw APIError.from(
								"FORBIDDEN",
								API_KEY_ERROR_CODES.INVALID_API_KEY,
							);
						}

						if (config.customAPIKeyValidator) {
							const isValid = await config.customAPIKeyValidator({
								ctx,
								key,
							});
							if (!isValid) {
								throw APIError.from(
									"FORBIDDEN",
									API_KEY_ERROR_CODES.INVALID_API_KEY,
								);
							}
						}

						const hashed = config.disableKeyHashing
							? key
							: await defaultKeyHasher(key);

						const apiKey = await validateApiKey({
							hashedKey: hashed,
							ctx,
							opts: config,
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
						if (config.deferUpdates) {
							ctx.context.runInBackground(cleanupTask);
						}

						// Session mocking only works for user-owned API keys
						// Determine the reference type from the configuration
						const referencesType = config.references ?? "user";
						if (referencesType !== "user") {
							const msg = API_KEY_ERROR_CODES.INVALID_REFERENCE_ID_FROM_API_KEY;
							throw APIError.from("UNAUTHORIZED", msg);
						}

						const user = await ctx.context.internalAdapter.findUserById(
							apiKey.referenceId,
						);
						if (!user) {
							const msg = API_KEY_ERROR_CODES.INVALID_REFERENCE_ID_FROM_API_KEY;
							throw APIError.from("UNAUTHORIZED", msg);
						}

						const session = {
							user,
							session: {
								id: apiKey.id,
								token: key,
								userId: apiKey.referenceId,
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
}

export type * from "./types";
