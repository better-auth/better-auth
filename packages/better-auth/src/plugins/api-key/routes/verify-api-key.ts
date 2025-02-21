import { z } from "zod";
import { APIError, createAuthEndpoint, getSessionFromCtx } from "../../../api";
import { ERROR_CODES } from "..";
import type { apiKeySchema } from "../schema";
import type { ApiKey } from "../types";
import { base64Url } from "@better-auth/utils/base64";
import { createHash } from "@better-auth/utils/hash";
import { isRateLimited } from "../rate-limit";
import type { AuthContext } from "../../../types";
import type { PredefinedApiKeyOptions } from ".";

export function verifyApiKey({
	opts,
	schema,
	deleteAllExpiredApiKeys,
}: {
	opts: PredefinedApiKeyOptions;
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

			// make sure that the user is not banned.
			if (session.user.banned === true) {
				opts.events?.({
					event: "key.verify",
					success: false,
					error: {
						code: "user.forbidden",
						message: ERROR_CODES.USER_BANNED,
					},
					user: session.user,
					apiKey: null,
				});

				throw new APIError("UNAUTHORIZED", {
					message: ERROR_CODES.USER_BANNED,
				});
			}

			if (key.length < opts.defaultKeyLength) {
				// if the key is shorter than the default key length, than we know the key is invalid.
				// we can't check if the key is exactly equal to the default key length, because
				// a prefix may be added to the key.
				opts.events?.({
					event: "key.verify",
					success: false,
					error: {
						code: "key.invalid",
						message: ERROR_CODES.INVALID_API_KEY,
					},
					user: session.user,
					apiKey: null,
				});
				throw new APIError("FORBIDDEN", {
					message: ERROR_CODES.INVALID_API_KEY,
				});
			}

			if (
				opts.customAPIKeyValidator &&
				!opts.customAPIKeyValidator({ ctx, key })
			) {
				opts.events?.({
					event: "key.verify",
					success: false,
					error: {
						code: "key.invalid",
						message: ERROR_CODES.INVALID_API_KEY,
					},
					user: session.user,
					apiKey: null,
				});
				throw new APIError("FORBIDDEN", {
					message: ERROR_CODES.INVALID_API_KEY,
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
					{
						field: "userId",
						value: session.user.id,
					},
				],
			});

			// No api key found
			if (!apiKey) {
				opts.events?.({
					event: "key.verify",
					success: false,
					error: {
						code: "key.notFound",
						message: ERROR_CODES.KEY_NOT_FOUND,
					},
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
					error: {
						code: "key.disabled",
						message: ERROR_CODES.KEY_DISABLED,
					},
					user: session.user,
					apiKey: null,
				});
				throw new APIError("FORBIDDEN", {
					message: ERROR_CODES.KEY_DISABLED,
				});
			}

			// key is expired
			if (apiKey.expiresAt) {
				const now = new Date().getTime();
				const expiresAt = apiKey.expiresAt.getTime();
				if (now > expiresAt) {
					opts.events?.({
						event: "key.verify",
						success: false,
						error: {
							code: "key.expired",
							message: ERROR_CODES.KEY_EXPIRED,
						},
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
						ctx.context.logger.error(
							`Failed to delete expired API keys:`,
							error,
						);
					}

					throw new APIError("FORBIDDEN", {
						message: ERROR_CODES.KEY_EXPIRED,
					});
				}
			}

			let remaining: number | null = apiKey.remaining;
			let lastRefillAt: Date | null = apiKey.lastRefillAt;
			if (apiKey.remaining === 0 && apiKey.refillAmount === null) {
				// if there is no more remaining requests, and there is no refill amount, than the key is revoked
				opts.events?.({
					event: "key.verify",
					success: false,
					error: {
						code: "key.expired",
						message: ERROR_CODES.KEY_EXPIRED,
					},
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
			} else if (remaining !== null) {
				let now = new Date().getTime();
				const refillInterval = apiKey.refillInterval;
				const refillAmount = apiKey.refillAmount;
				let lastTime = (lastRefillAt ?? apiKey.createdAt).getTime();

				if (refillInterval && refillAmount) {
					// if they provide refill info, then we should refill once the interval is reached.

					const timeSinceLastRequest = (now - lastTime) / (1000 * 60 * 60 * 24); // in days
					if (timeSinceLastRequest > refillInterval) {
						remaining = refillAmount;
						lastRefillAt = new Date();
					}
				}

				if (remaining === 0) {
					// if there are no more remaining requests, than the key is invalid
					opts.events?.({
						event: "key.verify",
						success: false,
						error: {
							code: "key.usageExceeded",
							message: ERROR_CODES.USAGE_EXCEEDED,
						},
						user: session.user,
						apiKey: null,
					});
					throw new APIError("FORBIDDEN", {
						message: ERROR_CODES.USAGE_EXCEEDED,
					});
				} else {
					remaining--;
				}
			}

			const { message, success, update, tryAgainIn } = isRateLimited(
				apiKey,
				opts,
			);

			let newApiKey: ApiKey = apiKey;
			try {
				const key = await ctx.context.adapter.update<ApiKey>({
					model: schema.apikey.modelName,
					where: [
						{
							field: "id",
							value: apiKey.id,
						},
					],
					update: {
						...update,
						remaining,
						lastRefillAt,
					},
				});
				if (key) newApiKey = key;
			} catch (error: any) {
				opts.events?.({
					event: "key.verify",
					success: false,
					error: {
						code: "database.error",
						message: error?.message,
					},
					user: session.user,
					apiKey: apiKey,
				});
				throw new APIError("INTERNAL_SERVER_ERROR", {
					message: error?.message,
				});
			}

			// If rate limit failed.
			if (success === false) {
				opts.events?.({
					event: "key.verify",
					success: false,
					error: {
						code: "key.rateLimited",
						message: message!,
						details: {
							tryAgainIn: tryAgainIn!,
						},
					},
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
				error: null,
				user: session.user,
				apiKey: newApiKey,
			});

			let resApiKey: Partial<ApiKey> = newApiKey;
			// biome-ignore lint/performance/noDelete: If we set this to `undefined`, the obj will still contain the `key` property, which looks ugly.
			delete resApiKey["key"];

			return ctx.json({
				valid: true,
				key: resApiKey,
			});
		},
	);
}
