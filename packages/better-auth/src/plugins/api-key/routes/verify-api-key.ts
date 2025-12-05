import type { AuthContext, GenericEndpointContext } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import { safeJSONParse } from "@better-auth/core/utils";
import * as z from "zod";
import { APIError } from "../../../api";
import { role } from "../../access";
import { API_KEY_TABLE_NAME, ERROR_CODES } from "..";
import { defaultKeyHasher } from "../";
import { deleteApiKey, getApiKey, setApiKey } from "../adapter";
import { isRateLimited } from "../rate-limit";
import type { apiKeySchema } from "../schema";
import type { ApiKey } from "../types";
import type { PredefinedApiKeyOptions } from ".";

export async function validateApiKey({
	hashedKey,
	ctx,
	opts,
	schema,
	permissions,
}: {
	hashedKey: string;
	opts: PredefinedApiKeyOptions;
	schema: ReturnType<typeof apiKeySchema>;
	permissions?: Record<string, string[]> | undefined;
	ctx: GenericEndpointContext;
}) {
	const apiKey = await getApiKey(ctx, hashedKey, opts);

	if (!apiKey) {
		throw new APIError("UNAUTHORIZED", {
			message: ERROR_CODES.INVALID_API_KEY,
		});
	}

	if (apiKey.enabled === false) {
		throw new APIError("UNAUTHORIZED", {
			message: ERROR_CODES.KEY_DISABLED,
			code: "KEY_DISABLED" as const,
		});
	}

	if (apiKey.expiresAt) {
		const now = Date.now();
		const expiresAt = new Date(apiKey.expiresAt).getTime();
		if (now > expiresAt) {
			try {
				if (opts.storage === "secondary-storage" && opts.fallbackToDatabase) {
					await deleteApiKey(ctx, apiKey, opts);
					await ctx.context.adapter.delete({
						model: API_KEY_TABLE_NAME,
						where: [
							{
								field: "id",
								value: apiKey.id,
							},
						],
					});
				} else if (opts.storage === "secondary-storage") {
					await deleteApiKey(ctx, apiKey, opts);
				} else {
					await ctx.context.adapter.delete({
						model: API_KEY_TABLE_NAME,
						where: [
							{
								field: "id",
								value: apiKey.id,
							},
						],
					});
				}
			} catch (error) {
				ctx.context.logger.error(`Failed to delete expired API keys:`, error);
			}

			throw new APIError("UNAUTHORIZED", {
				message: ERROR_CODES.KEY_EXPIRED,
				code: "KEY_EXPIRED" as const,
			});
		}
	}

	if (permissions) {
		const apiKeyPermissions = apiKey.permissions
			? safeJSONParse<{
					[key: string]: string[];
				}>(apiKey.permissions)
			: null;

		if (!apiKeyPermissions) {
			throw new APIError("UNAUTHORIZED", {
				message: ERROR_CODES.KEY_NOT_FOUND,
				code: "KEY_NOT_FOUND" as const,
			});
		}
		const r = role(apiKeyPermissions as any);
		const result = r.authorize(permissions);
		if (!result.success) {
			throw new APIError("UNAUTHORIZED", {
				message: ERROR_CODES.KEY_NOT_FOUND,
				code: "KEY_NOT_FOUND" as const,
			});
		}
	}

	let remaining = apiKey.remaining;
	let lastRefillAt = apiKey.lastRefillAt;

	if (apiKey.remaining === 0 && apiKey.refillAmount === null) {
		// if there is no more remaining requests, and there is no refill amount, than the key is revoked
		try {
			if (opts.storage === "secondary-storage") {
				// Secondary storage mode: delete from storage
				await deleteApiKey(ctx, apiKey, opts);
			} else {
				// Database mode: delete from DB
				await ctx.context.adapter.delete({
					model: API_KEY_TABLE_NAME,
					where: [
						{
							field: "id",
							value: apiKey.id,
						},
					],
				});
			}
		} catch (error) {
			ctx.context.logger.error(`Failed to delete expired API keys:`, error);
		}

		throw new APIError("TOO_MANY_REQUESTS", {
			message: ERROR_CODES.USAGE_EXCEEDED,
			code: "USAGE_EXCEEDED" as const,
		});
	} else if (remaining !== null) {
		let now = Date.now();
		const refillInterval = apiKey.refillInterval;
		const refillAmount = apiKey.refillAmount;
		let lastTime = new Date(lastRefillAt ?? apiKey.createdAt).getTime();

		if (refillInterval && refillAmount) {
			// if they provide refill info, then we should refill once the interval is reached.

			const timeSinceLastRequest = now - lastTime;
			if (timeSinceLastRequest > refillInterval) {
				remaining = refillAmount;
				lastRefillAt = new Date();
			}
		}

		if (remaining === 0) {
			// if there are no more remaining requests, than the key is invalid
			throw new APIError("TOO_MANY_REQUESTS", {
				message: ERROR_CODES.USAGE_EXCEEDED,
				code: "USAGE_EXCEEDED" as const,
			});
		} else {
			remaining--;
		}
	}

	const { message, success, update, tryAgainIn } = isRateLimited(apiKey, opts);

	let newApiKey: ApiKey | null = null;
	const updated: ApiKey = {
		...apiKey,
		...update,
		remaining,
		lastRefillAt,
		updatedAt: new Date(),
	};

	if (opts.storage === "database") {
		// Database mode only
		newApiKey = await ctx.context.adapter.update<ApiKey>({
			model: API_KEY_TABLE_NAME,
			where: [
				{
					field: "id",
					value: apiKey.id,
				},
			],
			update: updated,
		});
	} else {
		// Secondary storage mode: update in storage
		await setApiKey(ctx, updated, opts);
		newApiKey = updated;
	}

	if (!newApiKey) {
		throw new APIError("INTERNAL_SERVER_ERROR", {
			message: ERROR_CODES.FAILED_TO_UPDATE_API_KEY,
			code: "INTERNAL_SERVER_ERROR" as const,
		});
	}

	if (success === false) {
		throw new APIError("UNAUTHORIZED", {
			message: message ?? undefined,
			code: "RATE_LIMITED" as const,
			details: {
				tryAgainIn,
			},
		});
	}

	return newApiKey;
}

const verifyApiKeyBodySchema = z.object({
	key: z.string().meta({
		description: "The key to verify",
	}),
	permissions: z
		.record(z.string(), z.array(z.string()))
		.meta({
			description: "The permissions to verify.",
		})
		.optional(),
});

export function verifyApiKey({
	opts,
	schema,
	deleteAllExpiredApiKeys,
}: {
	opts: PredefinedApiKeyOptions;
	schema: ReturnType<typeof apiKeySchema>;
	deleteAllExpiredApiKeys(
		ctx: AuthContext,
		byPassLastCheckTime?: boolean | undefined,
	): void;
}) {
	return createAuthEndpoint(
		"/api-key/verify",
		{
			method: "POST",
			body: verifyApiKeyBodySchema,
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

			if (opts.customAPIKeyValidator) {
				const isValid = await opts.customAPIKeyValidator({ ctx, key });
				if (!isValid) {
					return ctx.json({
						valid: false,
						error: {
							message: ERROR_CODES.INVALID_API_KEY,
							code: "KEY_NOT_FOUND" as const,
						},
						key: null,
					});
				}
			}

			const hashed = opts.disableKeyHashing ? key : await defaultKeyHasher(key);

			let apiKey: ApiKey | null = null;

			try {
				apiKey = await validateApiKey({
					hashedKey: hashed,
					permissions: ctx.body.permissions,
					ctx,
					opts,
					schema,
				});
				await deleteAllExpiredApiKeys(ctx.context);
			} catch (error) {
				if (error instanceof APIError) {
					return ctx.json({
						valid: false,
						error: {
							message: error.body?.message,
							code: error.body?.code as string,
						},
						key: null,
					});
				}

				return ctx.json({
					valid: false,
					error: {
						message: ERROR_CODES.INVALID_API_KEY,
						code: "INVALID_API_KEY" as const,
					},
					key: null,
				});
			}

			const { key: _, ...returningApiKey } = apiKey ?? {
				key: 1,
				permissions: undefined,
			};
			if ("metadata" in returningApiKey) {
				returningApiKey.metadata =
					schema.apikey.fields.metadata.transform.output(
						returningApiKey.metadata as never as string,
					);
			}

			returningApiKey.permissions = returningApiKey.permissions
				? safeJSONParse<{
						[key: string]: string[];
					}>(returningApiKey.permissions)
				: null;

			return ctx.json({
				valid: true,
				error: null,
				key: apiKey === null ? null : (returningApiKey as Omit<ApiKey, "key">),
			});
		},
	);
}
