import type { AuthContext, GenericEndpointContext } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
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
		? await claimUsageInDatabase({ ctx, apiKey, opts, hashedKey })
		: await claimUsageInSecondaryStorage({ ctx, apiKey, opts, hashedKey });

	return { apiKey: newApiKey, opts };
}

/**
 * Atomically consume quota and a rate-limit slot against the database row, the
 * source of truth for `database` and `secondary-storage` + `fallbackToDatabase`
 * modes. Each guarded `incrementOne` only mutates the row while the guard still
 * holds, so concurrent verifications cannot drive `remaining` below zero or push
 * `requestCount` past the configured max. The cache (when present) is refreshed
 * from the resulting row.
 */
async function claimUsageInDatabase({
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
	let row: ApiKey = apiKey;

	if (apiKey.remaining !== null) {
		row = await consumeRemaining(ctx, apiKey);
	}

	row = await consumeRateLimit(ctx, row, opts);

	// A final `updatedAt` stamp returns the fully consolidated row, reflecting
	// every guarded counter write applied above.
	const finalRow = await ctx.context.adapter.update<ApiKey>({
		model: API_KEY_TABLE_NAME,
		where: [{ field: "id", value: row.id }],
		update: { updatedAt: new Date() },
	});

	// A null result means the row was deleted concurrently (for example the key
	// was revoked). Do not fall back to the in-memory row and re-cache a key
	// whose authoritative record is gone.
	if (!finalRow) {
		throw APIError.from("UNAUTHORIZED", ERROR_CODES.INVALID_API_KEY);
	}

	if (opts.storage === "secondary-storage" && opts.fallbackToDatabase) {
		await setApiKey(ctx, finalRow, opts);
	}

	return finalRow;
}

/**
 * Guarded quota consumption. When a refill is due, exactly one verification wins
 * the refill (compare-and-swap on the observed `lastRefillAt`); any concurrent
 * verification falls through to the plain guarded decrement against the refilled
 * value. The decrement only applies while `remaining > 0`, so it can never go
 * negative. Returns the updated row; throws when the quota is exhausted.
 */
async function consumeRemaining(
	ctx: GenericEndpointContext,
	apiKey: ApiKey,
): Promise<ApiKey> {
	const now = new Date();
	const { refillInterval, refillAmount } = apiKey;

	if (refillInterval && refillAmount) {
		const lastTime = new Date(
			apiKey.lastRefillAt ?? apiKey.createdAt,
		).getTime();
		if (now.getTime() - lastTime > refillInterval) {
			const refilled = await ctx.context.adapter.incrementOne<ApiKey>({
				model: API_KEY_TABLE_NAME,
				where: [
					{ field: "id", value: apiKey.id },
					{ field: "lastRefillAt", value: apiKey.lastRefillAt },
				],
				increment: {},
				set: { remaining: refillAmount - 1, lastRefillAt: now },
			});
			if (refilled) {
				return refilled;
			}
			// Lost the refill CAS: another verification already refilled. Fall
			// through and decrement against the refreshed value.
		}
	}

	const decremented = await ctx.context.adapter.incrementOne<ApiKey>({
		model: API_KEY_TABLE_NAME,
		where: [
			{ field: "id", value: apiKey.id },
			{ field: "remaining", operator: "gt", value: 0 },
		],
		increment: { remaining: -1 },
	});

	if (!decremented) {
		throw APIError.from("TOO_MANY_REQUESTS", ERROR_CODES.USAGE_EXCEEDED);
	}

	return decremented;
}

/**
 * Guarded rate-limit consumption. The common in-window path increments
 * `requestCount` only while it is below the max (compare-and-swap), so a burst
 * of concurrent verifications can never exceed the limit. Window resets and the
 * first request in a window are guarded conditional sets; a request that loses
 * every guard within an active window is rejected. Returns the updated row, or
 * the unchanged row when rate limiting does not apply.
 */
async function consumeRateLimit(
	ctx: GenericEndpointContext,
	apiKey: ApiKey,
	opts: PredefinedApiKeyOptions,
): Promise<ApiKey> {
	const decision = evaluateRateLimit(apiKey, opts);

	if (decision.type === "deny") {
		throw new APIError("TOO_MANY_REQUESTS", {
			message: decision.message,
			code: "RATE_LIMITED" as const,
			details: { tryAgainIn: decision.tryAgainIn },
		});
	}

	if (decision.type === "skip") {
		if (decision.lastRequest === null) {
			return apiKey;
		}
		const updated = await ctx.context.adapter.update<ApiKey>({
			model: API_KEY_TABLE_NAME,
			where: [{ field: "id", value: apiKey.id }],
			update: { lastRequest: decision.lastRequest },
		});
		return updated ?? apiKey;
	}

	if (decision.type === "increment") {
		const incremented = await ctx.context.adapter.incrementOne<ApiKey>({
			model: API_KEY_TABLE_NAME,
			where: [
				{ field: "id", value: apiKey.id },
				{
					field: "lastRequest",
					operator: "gt",
					value: decision.windowStart,
				},
				{
					field: "requestCount",
					operator: "lt",
					value: decision.max,
				},
			],
			increment: { requestCount: 1 },
			set: { lastRequest: decision.now },
		});
		if (incremented) {
			return incremented;
		}
		// The window rolled or the max was reached between the read and the
		// write. Re-evaluate against the freshest row to apply the right guard.
		const fresh = await ctx.context.adapter.findOne<ApiKey>({
			model: API_KEY_TABLE_NAME,
			where: [{ field: "id", value: apiKey.id }],
		});
		if (!fresh) {
			throw APIError.from("UNAUTHORIZED", ERROR_CODES.INVALID_API_KEY);
		}
		return consumeRateLimit(ctx, fresh, opts);
	}

	// "start" and "reset": set the count to 1 for a fresh window, guarded so a
	// concurrent increment in the same window cannot be silently overwritten.
	const windowGuard =
		decision.type === "reset"
			? {
					field: "lastRequest",
					operator: "lte" as const,
					value: decision.windowStart,
				}
			: { field: "lastRequest", operator: "eq" as const, value: null };

	const started = await ctx.context.adapter.incrementOne<ApiKey>({
		model: API_KEY_TABLE_NAME,
		where: [{ field: "id", value: apiKey.id }, windowGuard],
		increment: {},
		set: { requestCount: 1, lastRequest: decision.now },
	});
	if (started) {
		return started;
	}
	// Another verification already opened the window. Re-evaluate so this
	// request consumes an increment slot instead of resetting the count.
	const fresh = await ctx.context.adapter.findOne<ApiKey>({
		model: API_KEY_TABLE_NAME,
		where: [{ field: "id", value: apiKey.id }],
	});
	if (!fresh) {
		throw APIError.from("UNAUTHORIZED", ERROR_CODES.INVALID_API_KEY);
	}
	return consumeRateLimit(ctx, fresh, opts);
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
		if (remaining === 0) {
			throw APIError.from("TOO_MANY_REQUESTS", ERROR_CODES.USAGE_EXCEEDED);
		}
		remaining--;
	}

	const rateLimitUpdate = applyRateLimitToSnapshot(apiKey, opts);

	const mutations: Partial<ApiKey> = {
		...rateLimitUpdate,
		remaining,
		lastRefillAt,
		updatedAt: new Date(),
	};

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
