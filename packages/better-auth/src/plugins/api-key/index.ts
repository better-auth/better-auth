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
	EXPIRES_IN_IS_TOO_SMALL: "The expiresIn is smaller than the predefined minimum value.",
	EXPIRES_IN_IS_TOO_LARGE: "The expiresIn is larger than the predefined maximum value.",
};

export const apiKey = (options?: ApiKeyOptions) => {
	const opts = {
		...options,
		apiKeyHeaders: options?.apiKeyHeaders ?? "x-api-key",
		defaultKeyLength: options?.defaultKeyLength || 64,
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
				ctx.headers?.get(opts.apiKeyHeaders);
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
					matcher: (ctx) => !!getter(ctx),
					handler: createAuthMiddleware(async (ctx) => {
						const key = getter(ctx)!;

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

						const user = await ctx.context.internalAdapter.findUserById("");

						if (!user || !apiKey) {
							throw new APIError("UNAUTHORIZED");
						}

						ctx.context.session = {
							user,
							session: {
								id: apiKey.id,
								token: key,
								userId: user.id,
								userAgent: ctx.request?.headers.get("user-agent"),
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
					}),
				},
			],
		},
		endpoints: {
			createApiKey: routes.createApiKey,
			verifyApiKey: routes.verifyApiKey,
			getApiKey: routes.getApiKey,
			updateApiKey: routes.updateApiKey,
			deleteApiKey: routes.deleteApiKey,
		},
		schema: schema,
	} satisfies BetterAuthPlugin;
};
