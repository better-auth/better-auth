import type { AuthContext, GenericEndpointContext } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import type { Where } from "@better-auth/core/db/adapter";
import { APIError } from "@better-auth/core/error";
import { safeJSONParse } from "@better-auth/core/utils/json";
import { role } from "better-auth/plugins/access";
import * as z from "zod";
import { API_KEY_TABLE_NAME, API_KEY_ERROR_CODES as ERROR_CODES } from "..";
import { defaultKeyHasher } from "../";
import {
	deleteApiKey,
	getApiKey,
	migrateDoubleStringifiedMetadata,
	setApiKey,
} from "../adapter";
import { evaluateRateLimit } from "../rate-limit";
import type { apiKeySchema } from "../schema";
import type { ApiKey } from "../types";
import { isAPIError } from "../utils";
import type { PredefinedApiKeyOptions } from ".";
import { configIdMatches, resolveConfiguration } from ".";

export async function validateApiKey({
	key,
	ctx,
	lookupOpts,
	configurations,
	schema,
	permissions,
	expectedConfigId,
	runCustomValidator,
}: {
	key: string;
	lookupOpts: PredefinedApiKeyOptions;
	configurations: PredefinedApiKeyOptions[];
	schema: ReturnType<typeof apiKeySchema>;
	permissions?: Record<string, string[]> | undefined;
	ctx: GenericEndpointContext;
	expectedConfigId?: string | undefined;
	/**
	 * Run the key's own `customAPIKeyValidator`. Callers that already ran it
	 * against the correct config leave this off to avoid running it twice.
	 */
	runCustomValidator?: boolean | undefined;
}) {
	const hashedKey = lookupOpts.disableKeyHashing
		? key
		: await defaultKeyHasher(key);
	const apiKey = await getApiKey(ctx, hashedKey, lookupOpts);

	if (!apiKey) {
		throw APIError.from("UNAUTHORIZED", ERROR_CODES.INVALID_API_KEY);
	}

	if (
		expectedConfigId !== undefined &&
		!configIdMatches(apiKey.configId, expectedConfigId)
	) {
		throw APIError.from("UNAUTHORIZED", ERROR_CODES.INVALID_API_KEY);
	}

	// Switch from the caller's lookup config to the key's own config for
	// validation and updates. An unscoped verify cannot find keys that use a
	// different storage or hashing than the lookup config.
	const opts = resolveConfiguration(
		ctx.context,
		configurations,
		apiKey.configId,
	);

	if (runCustomValidator && opts.customAPIKeyValidator) {
		const isValid = await opts.customAPIKeyValidator({ ctx, key });
		if (!isValid) {
			throw APIError.from("UNAUTHORIZED", ERROR_CODES.KEY_NOT_FOUND);
		}
	}

	await validateApiKeyPolicy({ ctx, apiKey, opts, permissions });

	// A non-refillable key that is already exhausted is removed and rejected.
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
	}

	const usesDatabase =
		opts.storage === "database" ||
		(opts.storage === "secondary-storage" && opts.fallbackToDatabase);

	const newApiKey = usesDatabase
		? await claimUsageInDatabase({
				ctx,
				apiKey,
				opts,
				hashedKey,
				permissions,
			})
		: await claimUsageInSecondaryStorage({ ctx, apiKey, opts, hashedKey });

	return { apiKey: newApiKey, opts };
}

async function validateApiKeyPolicy({
	ctx,
	apiKey,
	opts,
	permissions,
}: {
	ctx: GenericEndpointContext;
	apiKey: ApiKey;
	opts: PredefinedApiKeyOptions;
	permissions?: Record<string, string[]> | undefined;
}): Promise<void> {
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
}

async function claimUsageInDatabase({
	ctx,
	apiKey,
	opts,
	hashedKey,
	permissions,
}: {
	ctx: GenericEndpointContext;
	apiKey: ApiKey;
	opts: PredefinedApiKeyOptions;
	hashedKey: string;
	permissions?: Record<string, string[]> | undefined;
}): Promise<ApiKey> {
	const canDefer =
		opts.deferUpdates &&
		ctx.context.options.advanced?.backgroundTasks?.handler !== undefined;
	if (!canDefer) {
		return claimUsageInDatabaseAuthoritatively({
			ctx,
			apiKey,
			opts,
			hashedKey,
			permissions,
		});
	}

	let mutations: Partial<ApiKey>;
	try {
		mutations = getOptimisticUsageMutations(apiKey, opts);
	} catch (error) {
		if (
			!isAPIError(error) ||
			(error.body?.code !== "USAGE_EXCEEDED" &&
				error.body?.code !== "RATE_LIMITED")
		) {
			throw error;
		}

		const freshApiKey = await ctx.context.adapter.findOne<ApiKey>({
			model: API_KEY_TABLE_NAME,
			where: [
				{ field: "id", value: apiKey.id },
				{ field: "key", value: hashedKey },
			],
		});
		if (!freshApiKey) {
			throw APIError.from("UNAUTHORIZED", ERROR_CODES.INVALID_API_KEY);
		}
		if (!configIdMatches(freshApiKey.configId, apiKey.configId)) {
			throw APIError.from("UNAUTHORIZED", ERROR_CODES.INVALID_API_KEY);
		}

		await validateApiKeyPolicy({
			ctx,
			apiKey: freshApiKey,
			opts,
			permissions,
		});
		// Reject a known fresh quota or rate-limit denial before the guarded
		// database path can consume the other counter.
		getOptimisticUsageMutations(freshApiKey, opts);

		return claimUsageInDatabaseAuthoritatively({
			ctx,
			apiKey: freshApiKey,
			opts,
			hashedKey,
			permissions,
		});
	}
	await ctx.context.runInBackgroundOrAwait(
		claimUsageInDatabaseAuthoritatively({
			ctx,
			apiKey,
			opts,
			hashedKey,
			permissions,
		}),
	);
	return { ...apiKey, ...mutations };
}

/**
 * Atomically consume quota and a rate-limit slot against the database row, the
 * source of truth for `database` and `secondary-storage` + `fallbackToDatabase`
 * modes. Quota and rate-limit state are derived from one snapshot and written by
 * one guarded `incrementOne`, so a request either consumes both allowances or
 * neither. The cache (when present) is refreshed from the resulting row.
 */
async function claimUsageInDatabaseAuthoritatively({
	ctx,
	apiKey,
	opts,
	hashedKey,
	permissions,
}: {
	ctx: GenericEndpointContext;
	apiKey: ApiKey;
	opts: PredefinedApiKeyOptions;
	hashedKey: string;
	permissions?: Record<string, string[]> | undefined;
}): Promise<ApiKey> {
	let row = apiKey;

	for (;;) {
		if (!configIdMatches(row.configId, apiKey.configId)) {
			throw APIError.from("UNAUTHORIZED", ERROR_CODES.INVALID_API_KEY);
		}
		await validateApiKeyPolicy({ ctx, apiKey: row, opts, permissions });

		const claimed = await ctx.context.adapter.incrementOne<ApiKey>({
			model: API_KEY_TABLE_NAME,
			where: getUsageSnapshotGuards(row),
			increment: {},
			set: getOptimisticUsageMutations(row, opts),
		});
		if (claimed) {
			if (opts.storage === "secondary-storage" && opts.fallbackToDatabase) {
				try {
					await setApiKey(ctx, claimed, opts);
				} catch (error) {
					ctx.context.logger.error(
						"Failed to refresh API key cache after committing usage:",
						error,
					);
					try {
						await deleteApiKey(ctx, claimed, opts);
					} catch (invalidationError) {
						ctx.context.logger.error(
							"Failed to invalidate API key cache after refresh failure:",
							invalidationError,
						);
					}
				}
			}
			return claimed;
		}

		const fresh = await ctx.context.adapter.findOne<ApiKey>({
			model: API_KEY_TABLE_NAME,
			where: [
				{ field: "id", value: apiKey.id },
				{ field: "key", value: hashedKey },
			],
		});
		if (!fresh) {
			throw APIError.from("UNAUTHORIZED", ERROR_CODES.INVALID_API_KEY);
		}
		row = fresh;
	}
}

/**
 * Exact compare-and-set guards for every field that affects whether this request
 * may consume usage. A concurrent policy or counter change makes the claim miss,
 * after which the fresh row is revalidated and reevaluated before another write.
 */
function getUsageSnapshotGuards(apiKey: ApiKey): Where[] {
	const permissions =
		typeof apiKey.permissions === "string"
			? apiKey.permissions
			: apiKey.permissions == null
				? null
				: JSON.stringify(apiKey.permissions);

	return [
		{ field: "id", value: apiKey.id },
		{ field: "key", value: apiKey.key },
		{ field: "configId", value: apiKey.configId ?? null },
		{ field: "enabled", value: apiKey.enabled },
		{ field: "expiresAt", value: apiKey.expiresAt },
		{ field: "permissions", value: permissions },
		{ field: "remaining", value: apiKey.remaining },
		{ field: "refillInterval", value: apiKey.refillInterval },
		{ field: "refillAmount", value: apiKey.refillAmount },
		{ field: "lastRefillAt", value: apiKey.lastRefillAt },
		{ field: "createdAt", value: apiKey.createdAt },
		{ field: "rateLimitEnabled", value: apiKey.rateLimitEnabled },
		{ field: "rateLimitTimeWindow", value: apiKey.rateLimitTimeWindow },
		{ field: "rateLimitMax", value: apiKey.rateLimitMax },
		{ field: "requestCount", value: apiKey.requestCount },
		{ field: "lastRequest", value: apiKey.lastRequest },
	];
}

/**
 * Secondary-storage-only mode has no database row to guard, so quota and
 * rate-limit consumption stays a read-modify-write merge over the serialized
 * key. This is the residual non-atomic path; strict enforcement requires the
 * database (use `fallbackToDatabase`) or an atomic secondary-storage primitive.
 * FIXME(api-key-secondary-atomic): back this with SecondaryStorage.increment on
 * `next` so secondary-storage-only mode enforces quota and rate limits atomically.
 */
async function claimUsageInSecondaryStorage({
	ctx,
	apiKey,
	opts,
	hashedKey,
}: {
	ctx: GenericEndpointContext;
	apiKey: ApiKey;
	opts: PredefinedApiKeyOptions;
	hashedKey: string;
}): Promise<ApiKey> {
	const mutations = getOptimisticUsageMutations(apiKey, opts);

	const performUpdate = async (): Promise<ApiKey | null> => {
		const fresh = await getApiKey(ctx, hashedKey, opts);
		if (!fresh) {
			return null;
		}
		const merged: ApiKey = { ...fresh, ...mutations };
		await setApiKey(ctx, merged, opts);
		return merged;
	};

	if (opts.deferUpdates) {
		ctx.context.runInBackground(
			performUpdate().catch((error) => {
				ctx.context.logger.error("Failed to update API key:", error);
			}),
		);
		return { ...apiKey, ...mutations };
	}

	const updated = await performUpdate();
	if (!updated) {
		throw APIError.from(
			"INTERNAL_SERVER_ERROR",
			ERROR_CODES.FAILED_TO_UPDATE_API_KEY,
		);
	}
	return updated;
}

function getOptimisticUsageMutations(
	apiKey: ApiKey,
	opts: PredefinedApiKeyOptions,
): Partial<ApiKey> {
	let remaining = apiKey.remaining;
	let lastRefillAt = apiKey.lastRefillAt;

	if (remaining !== null) {
		const now = Date.now();
		const { refillInterval, refillAmount } = apiKey;
		const lastTime = new Date(lastRefillAt ?? apiKey.createdAt).getTime();
		if (refillInterval && refillAmount && now - lastTime > refillInterval) {
			remaining = refillAmount;
			lastRefillAt = new Date();
		}
		if (remaining <= 0) {
			throw APIError.from("TOO_MANY_REQUESTS", ERROR_CODES.USAGE_EXCEEDED);
		}
		remaining--;
	}

	return {
		...applyRateLimitToSnapshot(apiKey, opts),
		remaining,
		lastRefillAt,
		updatedAt: new Date(),
	};
}

/**
 * Translate a rate-limit decision into a counter snapshot for the
 * secondary-storage merge write. Denials throw before any write.
 */
function applyRateLimitToSnapshot(
	apiKey: ApiKey,
	opts: PredefinedApiKeyOptions,
): Partial<ApiKey> {
	const decision = evaluateRateLimit(apiKey, opts);
	switch (decision.type) {
		case "deny":
			throw new APIError("TOO_MANY_REQUESTS", {
				message: decision.message,
				code: "RATE_LIMITED" as const,
				details: { tryAgainIn: decision.tryAgainIn },
			});
		case "skip":
			return decision.lastRequest === null
				? {}
				: { lastRequest: decision.lastRequest };
		case "start":
		case "reset":
			return { lastRequest: decision.now, requestCount: 1 };
		case "increment":
			return {
				lastRequest: decision.now,
				requestCount: apiKey.requestCount + 1,
			};
	}
}

const verifyApiKeyBodySchema = z.object({
	configId: z
		.string()
		.meta({
			description:
				"Configuration ID to scope verification to. When omitted, the key is validated against its own configuration.",
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
	return createAuthEndpoint.serverOnly(
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

			// Scoped: lookup config is the key's config, so run the validator now.
			// Unscoped runs it inside validateApiKey once the key's config is known.
			if (configId !== undefined && lookupOpts.customAPIKeyValidator) {
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

			let apiKey: ApiKey | null = null;
			let opts: PredefinedApiKeyOptions;

			try {
				const result = await validateApiKey({
					key,
					permissions: ctx.body.permissions,
					ctx,
					lookupOpts,
					configurations,
					schema,
					expectedConfigId: configId,
					// Scoped calls already ran the validator above with the right config.
					runCustomValidator: configId === undefined,
				});
				apiKey = result.apiKey;
				opts = result.opts;

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
