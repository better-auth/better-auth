import { z } from "zod";
import { APIError, createAuthEndpoint, getSessionFromCtx } from "../../../api";
import { ERROR_CODES } from "..";
import { generateId } from "../../../utils";
import { getDate } from "../../../utils/date";
import type { apiKeySchema } from "../schema";
import type { ApiKey } from "../types";
import type { AuthContext } from "../../../types";
import { createHash } from "@better-auth/utils/hash";
import { base64Url } from "@better-auth/utils/base64";
import type { PredefinedApiKeyOptions } from ".";

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
				name: z
					.string({ description: "Name of the Api Key" })
					.optional(),
				expiresIn: z
					.number({
						description: "Expiration time of the Api Key in milliseconds",
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
						description: "Amount to refill the remaining count of the Api Key",
					})
					.optional(),
				refillInterval: z
					.number({
						description: "Interval to refill the Api Key in milliseconds",
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
			} = ctx.body;

			const session = await getSessionFromCtx(ctx);

			// make sure that the user has a session.
			if (!session) {
				opts.events?.({
					event: "key.create",
					success: false,
					error_code: "user.unauthorized",
					error_message: ERROR_CODES.UNAUTHORIZED_SESSION,
					user: null,
					apiKey: null,
				});
				throw new APIError("UNAUTHORIZED", {
					message: ERROR_CODES.UNAUTHORIZED_SESSION,
				});
			}

			// make sure that the user is not banned.
			if (session.user.banned === true) {
				opts.events?.({
					event: "key.create",
					success: false,
					error_code: "user.forbidden",
					error_message: ERROR_CODES.USER_BANNED,
					user: null,
					apiKey: null,
				});

				throw new APIError("UNAUTHORIZED", {
					message: ERROR_CODES.USER_BANNED,
				});
			}

			// if metadata is defined, than check that it's an object.
			if (typeof metadata !== "undefined") {
				if(opts.enableMetadata === false){
					opts.events?.({
						event: "key.create",
						success: false,
						error_code: "request.forbidden",
						error_message: ERROR_CODES.METADATA_DISABLED,
						user: session.user,
						apiKey: null,
					});
					throw new APIError("BAD_REQUEST", {
						message: ERROR_CODES.METADATA_DISABLED,
					});
				}
				if(typeof metadata !== "object"){
					opts.events?.({
						event: "key.create",
						success: false,
						error_code: "request.forbidden",
						error_message: ERROR_CODES.INVALID_METADATA_TYPE,
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
					error_code: "request.forbidden",
					error_message: ERROR_CODES.REFILL_AMOUNT_AND_INTERVAL_REQUIRED,
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
					error_code: "request.forbidden",
					error_message: ERROR_CODES.REFILL_INTERVAL_AND_AMOUNT_REQUIRED,
					user: session.user,
					apiKey: null,
				});
				throw new APIError("BAD_REQUEST", {
					message: ERROR_CODES.REFILL_INTERVAL_AND_AMOUNT_REQUIRED,
				});
			}

			if (expiresIn) {
				const expiresIn_in_days = expiresIn * 86_400_000;
				if (opts.keyExpiration.minExpiresIn > expiresIn_in_days) {
					opts.events?.({
						event: "key.create",
						success: false,
						error_code: "key.invalidExpiration",
						error_message: ERROR_CODES.EXPIRES_IN_IS_TOO_SMALL,
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
						error_code: "key.invalidExpiration",
						error_message: ERROR_CODES.EXPIRES_IN_IS_TOO_LARGE,
						user: session.user,
						apiKey: null,
					});
					throw new APIError("BAD_REQUEST", {
						message: ERROR_CODES.EXPIRES_IN_IS_TOO_LARGE,
					});
				}
			}

			if (typeof remaining === "number") {
				if (remaining < opts.minimumRemaining) {
					opts.events?.({
						event: "key.create",
						success: false,
						error_code: "key.invalidRemaining",
						error_message: ERROR_CODES.INVALID_REMAINING,
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
						error_code: "key.invalidRemaining",
						error_message: ERROR_CODES.INVALID_REMAINING,
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
						error_code: "key.invalidPrefixLength",
						error_message: ERROR_CODES.INVALID_PREFIX_LENGTH,
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
						error_code: "key.invalidPrefixLength",
						error_message: ERROR_CODES.INVALID_PREFIX_LENGTH,
						user: session.user,
						apiKey: null,
					});
					throw new APIError("BAD_REQUEST", {
						message: ERROR_CODES.INVALID_PREFIX_LENGTH,
					});
				}
			}

			if(name) {
				if (name.length < opts.minimumNameLength) {
					opts.events?.({
						event: "key.create",
						success: false,
						error_code: "key.invalidNameLength",
						error_message: ERROR_CODES.INVALID_NAME_LENGTH,
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
						error_code: "key.invalidNameLength",
						error_message: ERROR_CODES.INVALID_NAME_LENGTH,
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

			const hash = await createHash("SHA-256").digest(
				new TextEncoder().encode(key),
			);
			const hashed = base64Url.encode(new Uint8Array(hash), {
				padding: false,
			});

			const apiKey = await ctx.context.adapter.create<ApiKey>({
				model: schema.apikey.modelName,
				data: {
					id: generateId(),
					createdAt: new Date(),
					updatedAt: new Date(),
					name: name ?? null,
					prefix: prefix ?? opts.defaultPrefix ?? null,
					key: hashed,
					enabled: true,
					expiresAt: expiresIn
						? getDate(expiresIn, "ms")
						: opts.keyExpiration.defaultExpiresIn
							? getDate(opts.keyExpiration.defaultExpiresIn, "ms")
							: null,
					userId: session.user.id,
					lastRefillAt: null,
					lastRequest: null,
					metadata: metadata ?? null,
					rateLimitMax: opts.rateLimit.maxRequests ?? null,
					rateLimitTimeWindow: opts.rateLimit.timeWindow ?? null,
					remaining: remaining ?? null,
					refillAmount: refillAmount ?? null,
					refillInterval: refillInterval ?? null,
					requestCount: 0,
				},
			});

			opts.events?.({
				event: "key.create",
				success: true,
				error_code: null,
				error_message: null,
				user: session.user,
				apiKey: apiKey,
			});
			return ctx.json({
				...apiKey,
				key: key,
			});
		},
	);
}
