import { z } from "zod";
import { createAuthEndpoint } from "../../../api";
import { ERROR_CODES } from "..";
import type { apiKeySchema } from "../schema";
import type { ApiKey } from "../types";
import { base64Url } from "@better-auth/utils/base64";
import { createHash } from "@better-auth/utils/hash";
import { isRateLimited } from "../rate-limit";
import type { AuthContext } from "../../../types";
import type { PredefinedApiKeyOptions } from ".";
import { safeJSONParse } from "../../../utils/json";
import { role } from "../../access";

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
				permissions: z.record(z.string(), z.array(z.string())).optional(),
			}),
			metadata: {
				SERVER_ONLY: true,
			},
		},
		async (ctx) => {
			const { key } = ctx.body;

			if (key.length < opts.defaultKeyLength) {
				// if the key is shorter than the default key length, than we know the key is invalid.
				// we can't check if the key is exactly equal to the default key length, because
				// a prefix may be added to the key.
				return ctx.json({
					valid: false,
					error: {
						message: ERROR_CODES.INVALID_API_KEY,
						code: "KEY_NOT_FOUND" as const,
					},
					key: null,
				});
			}

			if (
				opts.customAPIKeyValidator &&
				!opts.customAPIKeyValidator({ ctx, key })
			) {
				return ctx.json({
					valid: false,
					error: {
						message: ERROR_CODES.INVALID_API_KEY,
						code: "KEY_NOT_FOUND" as const,
					},
					key: null,
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
				return ctx.json({
					valid: false,
					error: {
						message: ERROR_CODES.KEY_NOT_FOUND,
						code: "KEY_NOT_FOUND" as const,
					},
					key: null,
				});
			}

			// key is disabled
			if (apiKey.enabled === false) {
				return ctx.json({
					valid: false,
					error: {
						message: ERROR_CODES.USAGE_EXCEEDED,
						code: "KEY_DISABLED" as const,
					},
					key: null,
				});
			}

			// key is expired
			if (apiKey.expiresAt) {
				const now = new Date().getTime();
				const expiresAt = apiKey.expiresAt.getTime();
				if (now > expiresAt) {
					try {
						ctx.context.adapter.delete({
							model: schema.apikey.modelName,
							where: [
								{
									field: "id",
									value: apiKey.id,
								},
							],
						});
					} catch (error) {
						ctx.context.logger.error(
							`Failed to delete expired API keys:`,
							error,
						);
					}

					return ctx.json({
						valid: false,
						error: {
							message: ERROR_CODES.KEY_EXPIRED,
							code: "KEY_EXPIRED" as const,
						},
						key: null,
					});
				}
			}

			const requiredPermissions = ctx.body.permissions;
			const apiKeyPermissions = apiKey.permissions
				? safeJSONParse(apiKey.permissions)
				: null;

			if (requiredPermissions) {
				if (!apiKeyPermissions) {
					return ctx.json({
						valid: false,
						error: {
							message: ERROR_CODES.KEY_NOT_FOUND,
							code: "KEY_NOT_FOUND" as const,
						},
						key: null,
					});
				}
				const r = role(apiKeyPermissions as any);
				const result = r.authorize(requiredPermissions);
				if (!result.success) {
					return ctx.json({
						valid: false,
						error: {
							message: ERROR_CODES.KEY_NOT_FOUND,
							code: "KEY_NOT_FOUND" as const,
						},
						key: null,
					});
				}
			}

			let remaining = apiKey.remaining;
			let lastRefillAt = apiKey.lastRefillAt;

			if (apiKey.remaining === 0 && apiKey.refillAmount === null) {
				// if there is no more remaining requests, and there is no refill amount, than the key is revoked
				try {
					ctx.context.adapter.delete({
						model: schema.apikey.modelName,
						where: [
							{
								field: "id",
								value: apiKey.id,
							},
						],
					});
				} catch (error) {
					ctx.context.logger.error(`Failed to delete expired API keys:`, error);
				}

				return ctx.json({
					valid: false,
					error: {
						message: ERROR_CODES.USAGE_EXCEEDED,
						code: "USAGE_EXCEEDED" as const,
					},
					key: null,
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

					// throw new APIError("FORBIDDEN", {
					// 	message: ERROR_CODES.USAGE_EXCEEDED,
					// });
					return ctx.json({
						valid: false,
						error: {
							message: ERROR_CODES.USAGE_EXCEEDED,
							code: "USAGE_EXCEEDED" as const,
						},
						key: null,
					});
				} else {
					remaining--;
				}
			}

			const { message, success, update, tryAgainIn } = isRateLimited(
				apiKey,
				opts,
			);
			const newApiKey = await ctx.context.adapter.update<ApiKey>({
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
			if (success === false) {
				return ctx.json({
					valid: false,
					error: {
						message,
						code: "RATE_LIMITED" as const,
						details: {
							tryAgainIn,
						},
					},
					key: null,
				});
			}
			deleteAllExpiredApiKeys(ctx.context);

			const { key: _, ...returningApiKey } = newApiKey ?? { key: 1 };

			return ctx.json({
				valid: true,
				error: null,
				key:
					newApiKey === null ? null : (returningApiKey as Omit<ApiKey, "key">),
			});
		},
	);
}
