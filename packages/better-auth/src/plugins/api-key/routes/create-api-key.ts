import { z } from "zod";
import { APIError, createAuthEndpoint } from "../../../api";
import { ERROR_CODES } from "..";
import { generateId } from "../../../utils";
import { getDate } from "../../../utils/date";
import type { apiKeySchema } from "../schema";
import type { ApiKey, ApiKeyOptions } from "../types";
import type { PredefinedApiKeyOptions } from "./internal.types";

export function createApiKey({
	keyGenerator,
	opts,
	schema,
}: {
	keyGenerator: (options: { length: number; prefix: string | undefined }) =>
		| Promise<string>
		| string;
	opts: ApiKeyOptions & Required<Pick<ApiKeyOptions, PredefinedApiKeyOptions>>;
	schema: ReturnType<typeof apiKeySchema>;
}) {
	return createAuthEndpoint(
		"/api-key/create",
		{
			method: "POST",
			body: z.object({
				name: z.string({ description: "Name of the Api Key" }).optional(),
				expiresIn: z
					.number({
						description: "Expiration time of the Api Key in milliseconds",
					})
					.optional()
					.nullable()
					.default(null),
				prefix: z.string({ description: "Prefix of the Api Key" }).optional(),
				remaining: z
					.number({ description: "Remaining number of requests" })
					.optional()
					.nullable()
					.default(null),
				enabled: z
					.boolean({ description: "Whether the Api Key is enabled" })
					.optional()
					.default(true),
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
				enabled,
				metadata,
				refillAmount,
				refillInterval,
			} = ctx.body;

			// make sure that the user has a session.
			if (!ctx.context.session) {
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
			if (ctx.context.session.user.banned === true) {
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
			if (typeof metadata !== "undefined" && typeof metadata !== "object") {
				opts.events?.({
					event: "key.create",
					success: false,
					error_code: "request.forbidden",
					error_message: ERROR_CODES.INVALID_METADATA_TYPE,
					user: ctx.context.session.user,
					apiKey: null,
				});
				throw new APIError("BAD_REQUEST", {
					message: ERROR_CODES.INVALID_METADATA_TYPE,
				});
			}

			// make sure that if they pass a refill amount, they also pass a refill interval
			if (refillAmount && !refillInterval) {
				opts.events?.({
					event: "key.create",
					success: false,
					error_code: "request.forbidden",
					error_message: ERROR_CODES.REFILL_AMOUNT_AND_INTERVAL_REQUIRED,
					user: ctx.context.session.user,
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
					user: ctx.context.session.user,
					apiKey: null,
				});
				throw new APIError("BAD_REQUEST", {
					message: ERROR_CODES.REFILL_INTERVAL_AND_AMOUNT_REQUIRED,
				});
			}

			const key = await keyGenerator({
				length: opts.defaultKeyLength,
				prefix: prefix || opts.defaultPrefix,
			});

			const apiKey = await ctx.context.adapter.create<ApiKey>({
				model: schema.apikey.modelName,
				data: {
					id: generateId(),
					createdAt: new Date(),
					updatedAt: new Date(),
					name: name ?? null,
					prefix: prefix ?? opts.defaultPrefix ?? null,
					key,
					enabled: enabled ?? true,
					expiresAt: expiresIn
						? getDate(expiresIn, "ms")
						: opts.keyExpiration.defaultExpiresIn
							? getDate(opts.keyExpiration.defaultExpiresIn, "ms")
							: null,
					userId: ctx.context.session.user.id,
					lastRefillAt: new Date(),
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
				user: ctx.context.session.user,
				apiKey: apiKey,
			});
		},
	);
}
