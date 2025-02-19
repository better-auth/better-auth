import { z } from "zod";
import { APIError, createAuthEndpoint, getSessionFromCtx } from "../../../api";
import { ERROR_CODES } from "..";
import type { apiKeySchema } from "../schema";
import type { ApiKey, ApiKeyOptions } from "../types";
import type { PredefinedApiKeyOptions } from "./internal.types";
import { isRateLimited } from "../rate-limit";
import { getDate } from "../../../utils/date";
import type { AuthContext } from "../../../types";

export function updateApiKey({
	opts,
	schema,
	deleteAllExpiredApiKeys,
}: {
	opts: ApiKeyOptions & Required<Pick<ApiKeyOptions, PredefinedApiKeyOptions>>;
	schema: ReturnType<typeof apiKeySchema>;
	deleteAllExpiredApiKeys(
		ctx: AuthContext,
		byPassLastCheckTime?: boolean,
	): Promise<number> | undefined;
}) {
	return createAuthEndpoint(
		"/api-key/update",
		{
			method: "POST",
			body: z.object({
				keyId: z.string({
					description: "The id of the Api Key",
				}),
				enabled: z
					.boolean({
						description: "Whether the Api Key is enabled or not",
					})
					.optional(),
				remaining: z
					.number({
						description: "The number of remaining requests",
					})
					.optional(),
				refillAmount: z
					.number({
						description: "The refill amount",
					})
					.optional(),
				metadata: z
					.any({
						description: "The metadata of the Api Key",
					})
					.optional(),
				expiresIn: z
					.number({
						description: "Expiration time of the Api Key in milliseconds",
					})
					.optional()
					.nullable()
					.default(null),
			}),
			metadata: {
				SERVER_ONLY: true,
			},
		},
		async (ctx) => {
			const { keyId, expiresIn, enabled, metadata, refillAmount, remaining } =
				ctx.body;

			const session = await getSessionFromCtx(ctx);

			// make sure that the user has a session.
			if (!session) {
				opts.events?.({
					event: "key.update",
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
					event: "key.update",
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

			const apiKey = await ctx.context.adapter.findOne<ApiKey>({
				model: schema.apikey.modelName,
				where: [
					{
						field: "id",
						value: keyId,
					},
				],
			});

			// No api key found
			if (!apiKey) {
				opts.events?.({
					event: "key.update",
					success: false,
					error_code: "key.notFound",
					error_message: ERROR_CODES.KEY_NOT_FOUND,
					user: session.user,
					apiKey: null,
				});
				throw new APIError("NOT_FOUND", {
					message: ERROR_CODES.KEY_NOT_FOUND,
				});
			}

			const { message, success, update } = isRateLimited(apiKey);

			let newValues: Partial<ApiKey> = {};

			if (enabled !== undefined) {
				newValues.enabled = enabled;
			}
			if (expiresIn !== undefined) {
				newValues.expiresAt = expiresIn ? getDate(expiresIn, "ms") : null;
			}
			if (metadata !== undefined) {
				if (typeof metadata !== "object") {
					opts.events?.({
						event: "key.update",
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
				newValues.metadata = metadata;
			}
			if (remaining !== undefined) {
				newValues.remaining = remaining;
			}
			if (refillAmount !== undefined) {
				newValues.refillAmount = refillAmount;
			}

			let newApiKey: ApiKey | null = apiKey;
			if (update) {
				try {
					newApiKey = await ctx.context.adapter.update<ApiKey>({
						model: schema.apikey.modelName,
						where: [
							{
								field: "id",
								value: apiKey.id,
							},
							{
								field: "userId",
								value: session.user.id,
							},
						],
						update: {
							lastRequest: new Date(),
							remaining:
								apiKey.remaining === null ? null : apiKey.remaining - 1,
							...newValues,
						},
					});
				} catch (error: any) {
					opts.events?.({
						event: "key.update",
						success: false,
						error_code: "database.error",
						error_message: error?.message,
						user: session.user,
						apiKey: apiKey,
					});
					throw new APIError("INTERNAL_SERVER_ERROR", {
						message: error?.message,
					});
				}
			}

			// If rate limit failed.
			if (success === false) {
				opts.events?.({
					event: "key.update",
					success: false,
					error_code: "key.rateLimited",
					error_message: message,
					user: session.user,
					apiKey: newApiKey,
				});
				throw new APIError("FORBIDDEN", {
					message: message || "Rate limit exceeded.",
				});
			}

			deleteAllExpiredApiKeys(ctx.context);

			opts.events?.({
				event: "key.update",
				success: true,
				error_code: null,
				error_message: null,
				user: session.user,
				apiKey: newApiKey,
			});
			return ctx.json({
				...newApiKey,
				key: undefined,
			});
		},
	);
}
