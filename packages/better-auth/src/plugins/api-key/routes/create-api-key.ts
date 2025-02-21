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
import { parseInputData } from "../../../db";

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
					.optional()
					.nullable()
					.default(null),
				prefix: z
					.string({ description: "Prefix of the Api Key" })
					.regex(/^[a-zA-Z0-9_-]+$/, {
						message:
							"Invalid prefix format, must be alphanumeric and contain only underscores and hyphens.",
					})
					.optional(),
				remaining: z
					.number({ description: "Remaining number of requests" })
					.optional()
					.nullable()
					.default(null),
				metadata: z.any({ description: "Metadata of the Api Key" }).optional(),
				refillAmount: z
					.number({
						description:
							"Amount to refill the remaining count of the Api Key. Server Only Property",
					})
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
				rateLimitMax,
				rateLimitTimeWindow,
				rateLimitEnabled,
			} = ctx.body;

			const session = await getSessionFromCtx(ctx);

			// make sure that the user has a session.
			if (!session) {
				opts.events?.({
					event: "key.create",
					success: false,
					error: {
						code: "user.unauthorized",
						message: ERROR_CODES.UNAUTHORIZED_SESSION,
					},
					user: null,
					apiKey: null,
				});
				throw new APIError("UNAUTHORIZED", {
					message: ERROR_CODES.UNAUTHORIZED_SESSION,
				});
			}

			if (ctx.request) {
				// if this endpoint was being called from the client,
				// we must make sure they can't use server-only properties.
				if (
					refillAmount !== undefined ||
					refillInterval !== undefined ||
					rateLimitMax !== undefined ||
					rateLimitTimeWindow !== undefined ||
					rateLimitEnabled !== undefined
				) {
					opts.events?.({
						event: "key.create",
						success: false,
						error: {
							code: "request.forbidden",
							message: ERROR_CODES.SERVER_ONLY_PROPERTY,
						},
						user: session.user,
						apiKey: null,
					});
					throw new APIError("BAD_REQUEST", {
						message: ERROR_CODES.SERVER_ONLY_PROPERTY,
					});
				}
			}

			// if metadata is defined, than check that it's an object.
			if (metadata) {
				if (opts.enableMetadata === false) {
					opts.events?.({
						event: "key.create",
						success: false,
						error: {
							code: "request.forbidden",
							message: ERROR_CODES.METADATA_DISABLED,
						},
						user: session.user,
						apiKey: null,
					});
					throw new APIError("BAD_REQUEST", {
						message: ERROR_CODES.METADATA_DISABLED,
					});
				}
				if (typeof metadata !== "object") {
					opts.events?.({
						event: "key.create",
						success: false,
						error: {
							code: "request.forbidden",
							message: ERROR_CODES.INVALID_METADATA_TYPE,
						},
						user: session.user,
						apiKey: null,
					});
					throw new APIError("BAD_REQUEST", {
						message: ERROR_CODES.INVALID_METADATA_TYPE,
					});
				}
			}

			// make sure that if they pass a refill amount, they also pass a refill interval
			if (refillAmount && !refillInterval) {
				opts.events?.({
					event: "key.create",
					success: false,
					error: {
						code: "request.forbidden",
						message: ERROR_CODES.REFILL_AMOUNT_AND_INTERVAL_REQUIRED,
					},
					user: session.user,
					apiKey: null,
				});
				throw new APIError("BAD_REQUEST", {
					message: ERROR_CODES.REFILL_AMOUNT_AND_INTERVAL_REQUIRED,
				});
			}
			// make sure that if they pass a refill interval, they also pass a refill amount
			if (refillInterval && !refillAmount) {
				opts.events?.({
					event: "key.create",
					success: false,
					error: {
						code: "request.forbidden",
						message: ERROR_CODES.REFILL_INTERVAL_AND_AMOUNT_REQUIRED,
					},
					user: session.user,
					apiKey: null,
				});
				throw new APIError("BAD_REQUEST", {
					message: ERROR_CODES.REFILL_INTERVAL_AND_AMOUNT_REQUIRED,
				});
			}

			if (expiresIn) {
				if (opts.keyExpiration.disableCustomExpiresTime === true) {
					opts.events?.({
						event: "key.create",
						success: false,
						error: {
							code: "key.disabledExpiration",
							message: ERROR_CODES.KEY_DISABLED_EXPIRATION,
						},
						user: session.user,
						apiKey: null,
					});
					throw new APIError("BAD_REQUEST", {
						message: ERROR_CODES.KEY_DISABLED_EXPIRATION,
					});
				}

				const expiresIn_in_days = expiresIn / (60 * 60 * 24);

				if (opts.keyExpiration.minExpiresIn > expiresIn_in_days) {
					opts.events?.({
						event: "key.create",
						success: false,
						error: {
							code: "key.invalidExpiration",
							message: ERROR_CODES.EXPIRES_IN_IS_TOO_SMALL,
							details: {
								maxExpiresIn: opts.keyExpiration.maxExpiresIn,
								receivedExpiresIn: expiresIn_in_days,
								minExpiresIn: opts.keyExpiration.minExpiresIn,
							},
						},
						user: session.user,
						apiKey: null,
					});
					throw new APIError("BAD_REQUEST", {
						message: ERROR_CODES.EXPIRES_IN_IS_TOO_SMALL,
					});
				} else if (opts.keyExpiration.maxExpiresIn < expiresIn_in_days) {
					opts.events?.({
						event: "key.create",
						success: false,
						error: {
							code: "key.invalidExpiration",
							message: ERROR_CODES.EXPIRES_IN_IS_TOO_LARGE,
							details: {
								maxExpiresIn: opts.keyExpiration.maxExpiresIn,
								receivedExpiresIn: expiresIn_in_days,
								minExpiresIn: opts.keyExpiration.minExpiresIn,
							},
						},
						user: session.user,
						apiKey: null,
					});
					throw new APIError("BAD_REQUEST", {
						message: ERROR_CODES.EXPIRES_IN_IS_TOO_LARGE,
					});
				}
			}

			if (remaining) {
				if (remaining < opts.minimumRemaining) {
					opts.events?.({
						event: "key.create",
						success: false,
						error: {
							code: "key.invalidRemaining",
							message: ERROR_CODES.INVALID_REMAINING,
							details: {
								maxRemaining: opts.maximumRemaining,
								receivedRemaining: remaining,
								minRemaining: opts.minimumRemaining,
							},
						},
						user: session.user,
						apiKey: null,
					});
					throw new APIError("BAD_REQUEST", {
						message: ERROR_CODES.INVALID_REMAINING,
					});
				}
				if (remaining > opts.maximumRemaining) {
					opts.events?.({
						event: "key.create",
						success: false,
						error: {
							code: "key.invalidRemaining",
							message: ERROR_CODES.INVALID_REMAINING,
							details: {
								maxRemaining: opts.maximumRemaining,
								receivedRemaining: remaining,
								minRemaining: opts.minimumRemaining,
							},
						},
						user: session.user,
						apiKey: null,
					});
					throw new APIError("BAD_REQUEST", {
						message: ERROR_CODES.INVALID_REMAINING,
					});
				}
			}

			if (prefix) {
				if (prefix.length < opts.minimumPrefixLength) {
					opts.events?.({
						event: "key.create",
						success: false,
						error: {
							code: "key.invalidPrefixLength",
							message: ERROR_CODES.INVALID_PREFIX_LENGTH,
							details: {
								minLength: opts.minimumPrefixLength,
								maxLength: opts.maximumPrefixLength,
								receivedLength: prefix.length,
							},
						},
						user: session.user,
						apiKey: null,
					});
					throw new APIError("BAD_REQUEST", {
						message: ERROR_CODES.INVALID_PREFIX_LENGTH,
					});
				}
				if (prefix.length > opts.maximumPrefixLength) {
					opts.events?.({
						event: "key.create",
						success: false,
						error: {
							code: "key.invalidPrefixLength",
							message: ERROR_CODES.INVALID_PREFIX_LENGTH,
							details: {
								minLength: opts.minimumPrefixLength,
								maxLength: opts.maximumPrefixLength,
								receivedLength: prefix.length,
							},
						},
						user: session.user,
						apiKey: null,
					});
					throw new APIError("BAD_REQUEST", {
						message: ERROR_CODES.INVALID_PREFIX_LENGTH,
					});
				}
			}

			if (name) {
				if (name.length < opts.minimumNameLength) {
					opts.events?.({
						event: "key.create",
						success: false,
						error: {
							code: "key.invalidNameLength",
							message: ERROR_CODES.INVALID_NAME_LENGTH,
							details: {
								minLength: opts.minimumNameLength,
								maxLength: opts.maximumNameLength,
								receivedLength: name.length,
							},
						},
						user: session.user,
						apiKey: null,
					});
					throw new APIError("BAD_REQUEST", {
						message: ERROR_CODES.INVALID_NAME_LENGTH,
					});
				}
				if (name.length > opts.maximumNameLength) {
					opts.events?.({
						event: "key.create",
						success: false,
						error: {
							code: "key.invalidNameLength",
							message: ERROR_CODES.INVALID_NAME_LENGTH,
							details: {
								minLength: opts.minimumNameLength,
								maxLength: opts.maximumNameLength,
								receivedLength: name.length,
							},
						},
						user: session.user,
						apiKey: null,
					});
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
				userId: session.user.id,
				lastRefillAt: null,
				lastRequest: null,
				metadata: null,
				rateLimitMax: rateLimitMax ?? opts.rateLimit.maxRequests ?? null,
				rateLimitTimeWindow:
					rateLimitTimeWindow ?? opts.rateLimit.timeWindow ?? null,
				remaining: remaining ?? null,
				refillAmount: refillAmount ?? null,
				refillInterval: refillInterval ?? null,
				rateLimitEnabled: rateLimitEnabled ?? true,
				requestCount: 0,
			};

			if (metadata) {
				const parseMetadata = parseInputData(
					data,
					apiKeySchema({
						rateLimitMax: opts.rateLimit.maxRequests!,
						timeWindow: opts.rateLimit.timeWindow!,
					}).apikey,
				);
				data.metadata = parseMetadata.metadata ?? null;
			}

			const apiKey = await ctx.context.adapter.create<ApiKey>({
				model: schema.apikey.modelName,
				data: data,
			});

			opts.events?.({
				event: "key.create",
				success: true,
				error: null,
				user: session.user,
				apiKey: apiKey,
			});

			return ctx.json({
				...apiKey,
				key: key,
				metadata: metadata ?? null,
			});
		},
	);
}
