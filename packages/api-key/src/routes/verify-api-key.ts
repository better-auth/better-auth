import type { AuthContext, GenericEndpointContext } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import { safeJSONParse } from "@better-auth/core/utils/json";
import { role } from "better-auth/plugins/access";
import * as z from "zod";
import {
	deleteApiKey,
	getApiKey,
	migrateDoubleStringifiedMetadata,
	setApiKey,
} from "../adapter.js";
import {
	API_KEY_TABLE_NAME,
	defaultKeyHasher,
	API_KEY_ERROR_CODES as ERROR_CODES,
} from "../index.js";
import { isRateLimited } from "../rate-limit.js";
import type { apiKeySchema } from "../schema.js";
import type { ApiKey } from "../types.js";
import { isAPIError } from "../utils.js";
import type { PredefinedApiKeyOptions } from "./index.js";
import { resolveConfiguration } from "./index.js";

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
		throw APIError.from("UNAUTHORIZED", ERROR_CODES.INVALID_API_KEY);
	}

	if (apiKey.enabled === false) {
		throw APIError.from("UNAUTHORIZED", ERROR_CODES.KEY_DISABLED);
	}

	if (apiKey.expiresAt) {
		const now = Date.now();
		const expiresAt = new Date(apiKey.expiresAt).getTime();
		if (now > expiresAt) {
			const deleteExpiredKey = async () => {
				if (opts.storage === "secondary-storage" && opts.fallbackToDatabase) {
					await deleteApiKey(ctx, apiKey, opts);
					await ctx.context.adapter.delete({
						model: API_KEY_TABLE_NAME,
						where: [{ field: "id", value: apiKey.id }],
					});
				} else if (opts.storage === "secondary-storage") {
					await deleteApiKey(ctx, apiKey, opts);
				} else {
					await ctx.context.adapter.delete({
						model: API_KEY_TABLE_NAME,
						where: [{ field: "id", value: apiKey.id }],
					});
				}
			};

			if (opts.deferUpdates) {
				ctx.context.runInBackground(
					deleteExpiredKey().catch((error) => {
						ctx.context.logger.error("Deferred update failed:", error);
					}),
				);
			} else {
				await deleteExpiredKey();
			}

			throw APIError.from("UNAUTHORIZED", ERROR_CODES.KEY_EXPIRED);
		}
	}

	if (permissions) {
		const apiKeyPermissions = apiKey.permissions
			? safeJSONParse<{
					[key: string]: string[];
				}>(apiKey.permissions)
			: null;

		if (!apiKeyPermissions) {
			throw APIError.from("UNAUTHORIZED", ERROR_CODES.KEY_NOT_FOUND);
		}
		const r = role(apiKeyPermissions as any);
		const result = r.authorize(permissions);
		if (!result.success) {
			throw APIError.from("UNAUTHORIZED", ERROR_CODES.KEY_NOT_FOUND);
		}
	}

	let remaining = apiKey.remaining;
	let lastRefillAt = apiKey.lastRefillAt;

	if (apiKey.remaining === 0 && apiKey.refillAmount === null) {
		const deleteExhaustedKey = async () => {
			if (opts.storage === "secondary-storage" && opts.fallbackToDatabase) {
				await deleteApiKey(ctx, apiKey, opts);
				await ctx.context.adapter.delete({
					model: API_KEY_TABLE_NAME,
					where: [{ field: "id", value: apiKey.id }],
				});
			} else if (opts.storage === "secondary-storage") {
				await deleteApiKey(ctx, apiKey, opts);
			} else {
				await ctx.context.adapter.delete({
					model: API_KEY_TABLE_NAME,
					where: [{ field: "id", value: apiKey.id }],
				});
			}
		};

		if (opts.deferUpdates) {
			ctx.context.runInBackground(
				deleteExhaustedKey().catch((error) => {
					ctx.context.logger.error("Deferred update failed:", error);
				}),
			);
		} else {
			await deleteExhaustedKey();
		}

		throw APIError.from("TOO_MANY_REQUESTS", ERROR_CODES.USAGE_EXCEEDED);
	} else if (remaining !== null) {
		const now = Date.now();
		const refillInterval = apiKey.refillInterval;
		const refillAmount = apiKey.refillAmount;
		const lastTime = new Date(lastRefillAt ?? apiKey.createdAt).getTime();

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
			throw APIError.from("TOO_MANY_REQUESTS", ERROR_CODES.USAGE_EXCEEDED);
		} else {
			remaining--;
		}
	}

	const { message, success, update, tryAgainIn } = isRateLimited(apiKey, opts);

	if (success === false) {
		throw new APIError("UNAUTHORIZED", {
			message: message ?? undefined,
			code: "RATE_LIMITED" as const,
			details: {
				tryAgainIn,
			},
		});
	}

	const updated: ApiKey = {
		...apiKey,
		...update,
		remaining,
		lastRefillAt,
		updatedAt: new Date(),
	};

	const performUpdate = async (): Promise<ApiKey | null> => {
		if (opts.storage === "database") {
			return ctx.context.adapter.update<ApiKey>({
				model: API_KEY_TABLE_NAME,
				where: [{ field: "id", value: apiKey.id }],
				update: { ...updated, id: undefined },
			});
		} else if (
			opts.storage === "secondary-storage" &&
			opts.fallbackToDatabase
		) {
			const dbUpdated = await ctx.context.adapter.update<ApiKey>({
				model: API_KEY_TABLE_NAME,
				where: [{ field: "id", value: apiKey.id }],
				update: { ...updated, id: undefined },
			});
			if (dbUpdated) {
				await setApiKey(ctx, dbUpdated, opts);
			}
			return dbUpdated;
		} else {
			await setApiKey(ctx, updated, opts);
			return updated;
		}
	};

	let newApiKey: ApiKey | null = null;

	if (opts.deferUpdates) {
		ctx.context.runInBackground(
			performUpdate().catch((error) => {
				ctx.context.logger.error("Failed to update API key:", error);
			}),
		);
		newApiKey = updated;
	} else {
		newApiKey = await performUpdate();
		if (!newApiKey) {
			throw APIError.from(
				"INTERNAL_SERVER_ERROR",
				ERROR_CODES.FAILED_TO_UPDATE_API_KEY,
			);
		}
	}

	return newApiKey;
}

const verifyApiKeyBodySchema = z.object({
	configId: z
		.string()
		.meta({
			description:
				"The configuration ID to use for verification. If not provided, the default configuration will be used.",
		})
		.optional(),
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
	configurations,
	schema,
	deleteAllExpiredApiKeys,
}: {
	configurations: PredefinedApiKeyOptions[];
	schema: ReturnType<typeof apiKeySchema>;
	deleteAllExpiredApiKeys(
		ctx: AuthContext,
		byPassLastCheckTime?: boolean | undefined,
	): Promise<void>;
}) {
	return createAuthEndpoint(
		{
			method: "POST",
			body: verifyApiKeyBodySchema,
		},
		async (ctx) => {
			const { configId, key } = ctx.body;

			// Use provided configId or fall back to default config
			const lookupOpts = resolveConfiguration(
				ctx.context,
				configurations,
				configId,
			);

			if (lookupOpts.customAPIKeyValidator) {
				const isValid = await lookupOpts.customAPIKeyValidator({ ctx, key });
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

			const hashed = lookupOpts.disableKeyHashing
				? key
				: await defaultKeyHasher(key);

			let apiKey: ApiKey | null = null;

			try {
				apiKey = await validateApiKey({
					hashedKey: hashed,
					permissions: ctx.body.permissions,
					ctx,
					opts: lookupOpts,
					schema,
				});

				// Resolve the correct config based on the API key's configId
				const opts = apiKey
					? resolveConfiguration(ctx.context, configurations, apiKey.configId)
					: lookupOpts;

				if (opts.deferUpdates) {
					ctx.context.runInBackground(
						deleteAllExpiredApiKeys(ctx.context).catch((err) => {
							ctx.context.logger.error(
								"Failed to delete expired API keys:",
								err,
							);
						}),
					);
				}
			} catch (error) {
				ctx.context.logger.error("Failed to validate API key:", error);
				if (isAPIError(error)) {
					return ctx.json({
						valid: false,
						error: {
							...error.body,
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

			// Resolve the correct config for metadata migration
			const opts = apiKey
				? resolveConfiguration(ctx.context, configurations, apiKey.configId)
				: lookupOpts;

			// Migrate legacy double-stringified metadata if needed
			let migratedMetadata: Record<string, any> | null = null;
			if (apiKey) {
				migratedMetadata = await migrateDoubleStringifiedMetadata(
					ctx,
					apiKey,
					opts,
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
				key:
					apiKey === null
						? null
						: ({
								...returningApiKey,
								metadata: migratedMetadata,
							} as Omit<ApiKey, "key">),
			});
		},
	);
}
