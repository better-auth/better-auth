import { z } from "zod";
import { APIError, createAuthEndpoint, getSessionFromCtx } from "../../../api";
import { ERROR_CODES } from "..";
import type { apiKeySchema } from "../schema";
import type { ApiKey, ApiKeyOptions } from "../types";
import { base64Url } from "@better-auth/utils/base64";
import { createHash } from "@better-auth/utils/hash";
import type { PredefinedApiKeyOptions } from "./internal.types";
import { isRateLimited } from "../rate-limit";
import type { AuthContext } from "../../../types";

export function verifyApiKey({
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
		"/api-key/verify",
		{
			method: "POST",
			body: z.object({
				key: z.string({
					description: "The key to verify",
				}),
			}),
			metadata: {
				SERVER_ONLY: true,
			},
		},
		async (ctx) => {
			const { key } = ctx.body;

			const session = await getSessionFromCtx(ctx);

			// make sure that the user has a session.
			if (!session) {
				opts.events?.({
					event: "key.verify",
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
					event: "key.verify",
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

			// No api key found
			if (!apiKey) {
				opts.events?.({
					event: "key.verify",
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

			// key is disabled
			if (apiKey.enabled === false) {
				opts.events?.({
					event: "key.verify",
					success: false,
					error_code: "key.disabled",
					error_message: ERROR_CODES.KEY_DISABLED,
					user: session.user,
					apiKey: null,
				});
				throw new APIError("FORBIDDEN", {
					message: ERROR_CODES.KEY_DISABLED,
				});
			}

			if (apiKey.remaining === 0 && apiKey.refillAmount === null) {
				// if there is no more remaining requests, and there is no refill amount, than the key is revoked
				opts.events?.({
					event: "key.verify",
					success: false,
					error_code: "key.expired",
					error_message: ERROR_CODES.KEY_EXPIRED,
					user: session.user,
					apiKey: null,
				});

				try {
					ctx.context.adapter.delete({
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
					});
				} catch (error) {
					ctx.context.logger.error(`Failed to delete expired API keys:`, error);
				}

				throw new APIError("FORBIDDEN", {
					message: ERROR_CODES.KEY_EXPIRED,
				});
			} else if (apiKey.remaining === 0) {
				// if there are no more remaining requests, than the key is invalid
				opts.events?.({
					event: "key.verify",
					success: false,
					error_code: "key.useageExceeded",
					error_message: ERROR_CODES.USAGE_EXCEEDED,
					user: session.user,
					apiKey: null,
				});
				throw new APIError("FORBIDDEN", {
					message: ERROR_CODES.USAGE_EXCEEDED,
				});
			}

			const { message, success, update } = isRateLimited(apiKey);

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
						],
						update: {
							lastRequest: new Date(),
							remaining:
								apiKey.remaining === null ? null : apiKey.remaining - 1,
						},
					});
				} catch (error: any) {
					opts.events?.({
						event: "key.verify",
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
					event: "key.verify",
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
				event: "key.verify",
				success: true,
				error_code: null,
				error_message: null,
				user: session.user,
				apiKey: newApiKey,
			});
			return ctx.json({
				valid: true,
				key: {
					...newApiKey,
					key: undefined,
				},
			});
		},
	);
}
