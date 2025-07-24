import * as z from "zod/v4";
import { APIError, createAuthEndpoint } from "../../../api";
import { API_KEY_TABLE_NAME, ERROR_CODES } from "..";
import type { apiKeySchema } from "../schema";
import type { ApiKey } from "../types";
import { isRateLimited } from "../rate-limit";
import type { AuthContext, GenericEndpointContext } from "../../../types";
import type { PredefinedApiKeyOptions } from ".";
import { safeJSONParse } from "../../../utils/json";
import { role } from "../../access";
import { defaultKeyHasher } from "../";

export async function validateApiKey({
	rawKey,
	ctx,
	opts,
	permissions,
	verifyStoredKey,
}: {
	rawKey: string;
	opts: PredefinedApiKeyOptions;
	permissions?: Record<string, string[]>;
	ctx: GenericEndpointContext;
	verifyStoredKey: (ctx: any, storedKey: string, key: string) => Promise<boolean>;
}) {
	// When storage method is hashed, we can directly query by the hashed key
	// For other methods, we need to fetch all keys and verify one by one
	let apiKey: ApiKey | null = null;

	if (opts.storeKey === "hashed" || (typeof opts.storeKey === "object" && "hash" in opts.storeKey)) {
		// For hashed keys, we can still do direct lookup
		const storedHashedKey = opts.storeKey === "hashed" 
			? await defaultKeyHasher(rawKey)
			: typeof opts.storeKey === "object" && "hash" in opts.storeKey
			? await opts.storeKey.hash(rawKey)
			: rawKey;

		apiKey = await ctx.context.adapter.findOne<ApiKey>({
			model: API_KEY_TABLE_NAME,
			where: [
				{
					field: "key",
					value: storedHashedKey,
				},
			],
		});
	} else {
		// For encrypted or plain keys, we need to verify each key
		// This is less efficient but necessary for these storage methods
		const allKeys = await ctx.context.adapter.findMany<ApiKey>({
			model: API_KEY_TABLE_NAME,
		});

		for (const key of allKeys) {
			const isValid = await verifyStoredKey(ctx, key.key, rawKey);
			if (isValid) {
				apiKey = key;
				break;
			}
		}
	}

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
		const now = new Date().getTime();
		const expiresAt = apiKey.expiresAt.getTime();
		if (now > expiresAt) {
			try {
				ctx.context.adapter.delete({
					model: API_KEY_TABLE_NAME,
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
				}>(
					//@ts-ignore - from DB, this value is always a string
					apiKey.permissions,
				)
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
			ctx.context.adapter.delete({
				model: API_KEY_TABLE_NAME,
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

		throw new APIError("TOO_MANY_REQUESTS", {
			message: ERROR_CODES.USAGE_EXCEEDED,
			code: "USAGE_EXCEEDED" as const,
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
			throw new APIError("TOO_MANY_REQUESTS", {
				message: ERROR_CODES.USAGE_EXCEEDED,
				code: "USAGE_EXCEEDED" as const,
			});
		} else {
			remaining--;
		}
	}

	const { message, success, update, tryAgainIn } = isRateLimited(apiKey, opts);

	const newApiKey = await ctx.context.adapter.update<ApiKey>({
		model: API_KEY_TABLE_NAME,
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

export function verifyApiKey({
	opts,
	schema,
	deleteAllExpiredApiKeys,
	verifyStoredKey,
}: {
	opts: PredefinedApiKeyOptions;
	schema: ReturnType<typeof apiKeySchema>;
	deleteAllExpiredApiKeys(
		ctx: AuthContext,
		byPassLastCheckTime?: boolean,
	): Promise<number> | undefined;
	verifyStoredKey: (ctx: any, storedKey: string, key: string) => Promise<boolean>;
}) {
	return createAuthEndpoint(
		"/api-key/verify",
		{
			method: "POST",
			body: z.object({
				key: z.string().meta({
					description: "The key to verify",
				}),
				permissions: z
					.record(z.string(), z.array(z.string()))
					.meta({
						description: "The permissions to verify.",
					})
					.optional(),
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

			let apiKey: ApiKey | null = null;

			try {
				apiKey = await validateApiKey({
					rawKey: key,
					permissions: ctx.body.permissions,
					ctx,
					opts,
					verifyStoredKey,
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
					}>(
						//@ts-ignore - from DB, this value is always a string
						returningApiKey.permissions,
					)
				: null;

			return ctx.json({
				valid: true,
				error: null,
				key: apiKey === null ? null : (returningApiKey as Omit<ApiKey, "key">),
			});
		},
	);
}
