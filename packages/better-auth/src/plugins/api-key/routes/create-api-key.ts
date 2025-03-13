import { z } from "zod";
import { APIError, createAuthEndpoint, getSessionFromCtx } from "../../../api";
import { ERROR_CODES } from "..";
import { generateId } from "../../../utils";
import { getDate } from "../../../utils/date";
import { apiKeySchema } from "../schema";
import type { ApiKey } from "../types";
import type { AuthContext } from "../../../types";
import { createHash } from "@better-auth/utils/hash";
import { base64Url } from "@better-auth/utils/base64";
import type { PredefinedApiKeyOptions } from ".";
import { safeJSONParse } from "../../../utils/json";

export function createApiKey({
	keyGenerator,
	opts,
	schema,
	deleteAllExpiredApiKeys,
}: {
	keyGenerator: (options: { length: number; prefix: string | undefined }) =>
		| Promise<string>
		| string;
	opts: PredefinedApiKeyOptions;
	schema: ReturnType<typeof apiKeySchema>;
	deleteAllExpiredApiKeys(
		ctx: AuthContext,
		byPassLastCheckTime?: boolean,
	): Promise<number> | undefined;
}) {
	return createAuthEndpoint(
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

				userId: z
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
		},
		async (ctx) => {
			const {
				name,
				expiresIn,
				prefix,
				remaining,
				metadata,
				refillAmount,
				refillInterval,
				permissions,
				rateLimitMax,
				rateLimitTimeWindow,
				rateLimitEnabled,
			} = ctx.body;

			const session = await getSessionFromCtx(ctx);
			const authRequired = (ctx.request || ctx.headers) && !ctx.body.userId;
			const user =
				session?.user ?? (authRequired ? null : { id: ctx.body.userId });
			if (!user?.id) {
				throw new APIError("UNAUTHORIZED", {
					message: ERROR_CODES.UNAUTHORIZED_SESSION,
				});
			}

			if (authRequired) {
				// if this endpoint was being called from the client,
				// we must make sure they can't use server-only properties.
				if (
					refillAmount !== undefined ||
					refillInterval !== undefined ||
					rateLimitMax !== undefined ||
					rateLimitTimeWindow !== undefined ||
					rateLimitEnabled !== undefined ||
					permissions !== undefined ||
					remaining !== null
				) {
					throw new APIError("BAD_REQUEST", {
						message: ERROR_CODES.SERVER_ONLY_PROPERTY,
					});
				}
			}

			// if metadata is defined, than check that it's an object.
			if (metadata) {
				if (opts.enableMetadata === false) {
					throw new APIError("BAD_REQUEST", {
						message: ERROR_CODES.METADATA_DISABLED,
					});
				}
				if (typeof metadata !== "object") {
					throw new APIError("BAD_REQUEST", {
						message: ERROR_CODES.INVALID_METADATA_TYPE,
					});
				}
			}

			// make sure that if they pass a refill amount, they also pass a refill interval
			if (refillAmount && !refillInterval) {
				throw new APIError("BAD_REQUEST", {
					message: ERROR_CODES.REFILL_AMOUNT_AND_INTERVAL_REQUIRED,
				});
			}
			// make sure that if they pass a refill interval, they also pass a refill amount
			if (refillInterval && !refillAmount) {
				throw new APIError("BAD_REQUEST", {
					message: ERROR_CODES.REFILL_INTERVAL_AND_AMOUNT_REQUIRED,
				});
			}

			if (expiresIn) {
				if (opts.keyExpiration.disableCustomExpiresTime === true) {
					throw new APIError("BAD_REQUEST", {
						message: ERROR_CODES.KEY_DISABLED_EXPIRATION,
					});
				}

				const expiresIn_in_days = expiresIn / (60 * 60 * 24);

				if (opts.keyExpiration.minExpiresIn > expiresIn_in_days) {
					throw new APIError("BAD_REQUEST", {
						message: ERROR_CODES.EXPIRES_IN_IS_TOO_SMALL,
					});
				} else if (opts.keyExpiration.maxExpiresIn < expiresIn_in_days) {
					throw new APIError("BAD_REQUEST", {
						message: ERROR_CODES.EXPIRES_IN_IS_TOO_LARGE,
					});
				}
			}
			if (prefix) {
				if (prefix.length < opts.minimumPrefixLength) {
					throw new APIError("BAD_REQUEST", {
						message: ERROR_CODES.INVALID_PREFIX_LENGTH,
					});
				}
				if (prefix.length > opts.maximumPrefixLength) {
					throw new APIError("BAD_REQUEST", {
						message: ERROR_CODES.INVALID_PREFIX_LENGTH,
					});
				}
			}

			if (name) {
				if (name.length < opts.minimumNameLength) {
					throw new APIError("BAD_REQUEST", {
						message: ERROR_CODES.INVALID_NAME_LENGTH,
					});
				}
				if (name.length > opts.maximumNameLength) {
					throw new APIError("BAD_REQUEST", {
						message: ERROR_CODES.INVALID_NAME_LENGTH,
					});
				}
			}

			deleteAllExpiredApiKeys(ctx.context);

			const key = await keyGenerator({
				length: opts.defaultKeyLength,
				prefix: prefix || opts.defaultPrefix,
			});

			const hash = await createHash("SHA-256").digest(key);
			const hashed = base64Url.encode(hash, {
				padding: false,
			});

			let start: string | null = null;

			if (opts.startingCharactersConfig.shouldStore) {
				start = key.substring(
					0,
					opts.startingCharactersConfig.charactersLength,
				);
			}

			const defaultPermissions = opts.permissions?.defaultPermissions
				? typeof opts.permissions.defaultPermissions === "function"
					? await opts.permissions.defaultPermissions(user.id, ctx)
					: opts.permissions.defaultPermissions
				: undefined;
			const permissionsToApply = permissions
				? JSON.stringify(permissions)
				: defaultPermissions
					? JSON.stringify(defaultPermissions)
					: undefined;
			let data: ApiKey = {
				id: generateId(),
				createdAt: new Date(),
				updatedAt: new Date(),
				name: name ?? null,
				prefix: prefix ?? opts.defaultPrefix ?? null,
				start: start,
				key: hashed,
				enabled: true,
				expiresAt: expiresIn
					? getDate(expiresIn, "sec")
					: opts.keyExpiration.defaultExpiresIn
						? getDate(opts.keyExpiration.defaultExpiresIn, "sec")
						: null,
				userId: user.id,
				lastRefillAt: null,
				lastRequest: null,
				metadata: null,
				rateLimitMax: rateLimitMax ?? opts.rateLimit.maxRequests ?? null,
				rateLimitTimeWindow:
					rateLimitTimeWindow ?? opts.rateLimit.timeWindow ?? null,
				remaining: remaining || refillAmount || null,
				refillAmount: refillAmount ?? null,
				refillInterval: refillInterval ?? null,
				rateLimitEnabled: rateLimitEnabled ?? true,
				requestCount: 0,
				permissions: permissionsToApply,
			};

			if (metadata) {
				//@ts-expect-error - we intentionally save the metadata as string on DB.
				data.metadata = schema.apikey.fields.metadata.transform.input(metadata);
			}

			const apiKey = await ctx.context.adapter.create<ApiKey>({
				model: schema.apikey.modelName,
				data: data,
			});
			return ctx.json({
				...apiKey,
				key: key,
				metadata: metadata ?? null,
				permissions: apiKey.permissions
					? safeJSONParse(apiKey.permissions)
					: null,
			});
		},
	);
}
