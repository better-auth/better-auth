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
	getApiKeyById,
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
	// validation and updates. An unscoped verify uses the default hashing mode.
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
			const deleteExpiredKey = () => deleteApiKey(ctx, apiKey, opts);

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
		const r = role(apiKeyPermissions);
		const result = r.authorize(permissions);
		if (!result.success) {
			throw APIError.from("UNAUTHORIZED", ERROR_CODES.KEY_NOT_FOUND);
		}
	}

	// A non-refillable key that is already exhausted is removed and rejected.
	if (apiKey.remaining === 0 && apiKey.refillAmount === null) {
		const deleteExhaustedKey = () => deleteApiKey(ctx, apiKey, opts);

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

	const newApiKey = await claimUsageInDatabase({
		ctx,
		apiKey,
		opts,
	});

	return { apiKey: newApiKey, opts };
}

// A cache entry can outlive invalidation when an in-flight read writes it back.
function credentialGuard(apiKey: ApiKey): Where[] {
	return [
		{ field: "id", value: apiKey.id },
		{ field: "key", value: apiKey.key },
		{ field: "enabled", value: apiKey.enabled ?? null },
	];
}

async function readCurrentCredential(
	ctx: GenericEndpointContext,
	apiKey: ApiKey,
) {
	const fresh = await getApiKeyById(ctx, apiKey.id);
	if (!fresh || fresh.key !== apiKey.key) {
		throw APIError.from("UNAUTHORIZED", ERROR_CODES.INVALID_API_KEY);
	}
	if (fresh.enabled === false) {
		throw APIError.from("UNAUTHORIZED", ERROR_CODES.KEY_DISABLED);
	}
	return fresh;
}

const MAX_USAGE_CLAIM_ATTEMPTS = 8;

async function claimUsageInDatabase({
	ctx,
	apiKey,
	opts,
}: {
	ctx: GenericEndpointContext;
	apiKey: ApiKey;
	opts: PredefinedApiKeyOptions;
}): Promise<ApiKey> {
	for (let attempt = 0; attempt < MAX_USAGE_CLAIM_ATTEMPTS; attempt++) {
		const claimed = await tryClaimUsage(ctx, apiKey, opts);
		if (claimed) {
			await setApiKey(ctx, claimed, opts);
			return claimed;
		}

		apiKey = await readCurrentCredential(ctx, apiKey);
	}

	throw APIError.from(
		"SERVICE_UNAVAILABLE",
		ERROR_CODES.FAILED_TO_UPDATE_API_KEY,
	);
}

function tryClaimUsage(
	ctx: GenericEndpointContext,
	apiKey: ApiKey,
	opts: PredefinedApiKeyOptions,
): Promise<ApiKey | null> {
	const now = new Date();
	const where: Where[] = [
		...credentialGuard(apiKey),
		{ field: "refillAmount", value: apiKey.refillAmount ?? null },
		{ field: "refillInterval", value: apiKey.refillInterval ?? null },
		{ field: "rateLimitEnabled", value: apiKey.rateLimitEnabled ?? null },
		{ field: "rateLimitMax", value: apiKey.rateLimitMax ?? null },
		{ field: "rateLimitTimeWindow", value: apiKey.rateLimitTimeWindow ?? null },
	];
	const increment: Record<string, number> = {};
	const set: Record<string, number | Date> = { updatedAt: now };

	const { remaining, refillInterval, refillAmount, lastRefillAt } = apiKey;
	if (remaining === null) {
		where.push({ field: "remaining", value: null });
	} else if (
		refillInterval &&
		refillAmount &&
		now.getTime() - (lastRefillAt ?? apiKey.createdAt).getTime() >
			refillInterval
	) {
		where.push({ field: "lastRefillAt", value: lastRefillAt });
		where.push({ field: "remaining", value: remaining });
		set.remaining = refillAmount - 1;
		set.lastRefillAt = now;
	} else {
		if (remaining <= 0) {
			throw APIError.from("TOO_MANY_REQUESTS", ERROR_CODES.USAGE_EXCEEDED);
		}
		where.push({ field: "remaining", operator: "gt", value: 0 });
		increment.remaining = -1;
	}

	const decision = evaluateRateLimit(apiKey, opts);
	switch (decision.type) {
		case "deny":
			throw new APIError("TOO_MANY_REQUESTS", {
				message: decision.message,
				code: "RATE_LIMITED" as const,
				details: { tryAgainIn: decision.tryAgainIn },
			});
		case "skip":
			if (decision.lastRequest !== null) set.lastRequest = decision.lastRequest;
			break;
		case "start":
			where.push({ field: "lastRequest", value: null });
			set.requestCount = 1;
			set.lastRequest = decision.now;
			break;
		case "reset":
			where.push({
				field: "lastRequest",
				operator: "lte",
				value: decision.windowStart,
			});
			set.requestCount = 1;
			set.lastRequest = decision.now;
			break;
		case "increment":
			where.push(
				{ field: "lastRequest", operator: "gt", value: decision.windowStart },
				{ field: "requestCount", operator: "lt", value: decision.max },
			);
			increment.requestCount = 1;
			set.lastRequest = decision.now;
			break;
	}

	return ctx.context.adapter.incrementOne<ApiKey>({
		model: API_KEY_TABLE_NAME,
		where,
		increment,
		set,
	});
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
			let migratedMetadata: ApiKey["metadata"] = null;
			if (apiKey) {
				migratedMetadata = await migrateDoubleStringifiedMetadata(ctx, apiKey);
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
