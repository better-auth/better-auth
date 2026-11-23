import type { GenericEndpointContext } from "@better-auth/core";
import type { Where } from "@better-auth/core/db/adapter";
import { readApiKeyMetadata } from "./metadata";
import type { PredefinedApiKeyOptions } from "./routes";
import { configIdMatches } from "./routes";
import type { ApiKey } from "./types";

/**
 * Parses double-stringified metadata synchronously without updating the database.
 *
 * @returns The properly parsed metadata object, or the original if already an object
 */
export function parseDoubleStringifiedMetadata(
	metadata: ApiKey["metadata"],
): ApiKey["metadata"] {
	// If metadata is null/undefined, return null
	if (metadata == null) {
		return null;
	}

	// If metadata is already an object, no migration needed
	if (typeof metadata === "object") {
		return metadata;
	}

	// Metadata is a string - this is legacy double-stringified data
	// Parse it to get the actual object
	const parsed = readApiKeyMetadata(metadata);
	return typeof parsed === "object" ? parsed : null;
}

/**
 * Checks if metadata needs migration (is a string instead of object)
 */
function needsMetadataMigration(metadata: ApiKey["metadata"]): boolean {
	return metadata != null && typeof metadata === "string";
}

/**
 * Batch migrates double-stringified metadata for multiple API keys.
 * Runs all updates in parallel to avoid N sequential database calls.
 */
export async function batchMigrateLegacyMetadata(
	ctx: GenericEndpointContext,
	apiKeys: ApiKey[],
): Promise<void> {
	// Filter keys that need migration
	const keysToMigrate = apiKeys.filter((key) =>
		needsMetadataMigration(key.metadata),
	);

	if (keysToMigrate.length === 0) {
		return;
	}

	// Run migrations in parallel (not sequentially)
	const migrationPromises = keysToMigrate.map(async (apiKey) => {
		const parsed = parseDoubleStringifiedMetadata(apiKey.metadata);
		try {
			await ctx.context.adapter.update({
				model: "apikey",
				where: [{ field: "id", value: apiKey.id }],
				update: { metadata: parsed },
			});
		} catch (error) {
			ctx.context.logger.warn(
				`Failed to migrate double-stringified metadata for API key ${apiKey.id}:`,
				error,
			);
		}
	});

	await Promise.all(migrationPromises);
}

/**
 * Migrates double-stringified metadata to properly parsed object.
 *
 * This handles legacy data where metadata was incorrectly double-stringified.
 * If metadata is a string (should be object after adapter's transform.output),
 * it parses it and optionally updates the database.
 *
 * @returns The properly parsed metadata object
 */
export async function migrateDoubleStringifiedMetadata(
	ctx: GenericEndpointContext,
	apiKey: ApiKey,
): Promise<ApiKey["metadata"]> {
	const parsed = parseDoubleStringifiedMetadata(apiKey.metadata);

	if (needsMetadataMigration(apiKey.metadata)) {
		try {
			await ctx.context.adapter.update({
				model: "apikey",
				where: [{ field: "id", value: apiKey.id }],
				update: { metadata: parsed },
			});
		} catch (error) {
			// Log but don't fail the request if migration update fails
			ctx.context.logger.warn(
				`Failed to migrate double-stringified metadata for API key ${apiKey.id}:`,
				error,
			);
		}
	}

	return parsed;
}

function getCache(ctx: GenericEndpointContext, opts: PredefinedApiKeyOptions) {
	return opts.storage === "secondary-storage"
		? (opts.customStorage ?? ctx.context.secondaryStorage)
		: undefined;
}

function cacheKeyByHash(key: string) {
	return `api-key:${key}`;
}

function cacheKeyById(id: string) {
	return `api-key:by-id:${id}`;
}

export function deserializeApiKey(data: unknown): ApiKey | null {
	if (!data) return null;

	try {
		const parsed = (
			typeof data === "string" ? JSON.parse(data) : data
		) as ApiKey;
		return {
			...parsed,
			createdAt: new Date(parsed.createdAt),
			updatedAt: new Date(parsed.updatedAt),
			expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt) : null,
			lastRefillAt: parsed.lastRefillAt ? new Date(parsed.lastRefillAt) : null,
			lastRequest: parsed.lastRequest ? new Date(parsed.lastRequest) : null,
		};
	} catch {
		return null;
	}
}

export function getApiKey(
	ctx: GenericEndpointContext,
	hashedKey: string,
	opts: PredefinedApiKeyOptions,
): Promise<ApiKey | null> {
	return getCachedApiKey(
		ctx,
		"key",
		hashedKey,
		cacheKeyByHash(hashedKey),
		opts,
	);
}

export function getApiKeyById(
	ctx: GenericEndpointContext,
	id: string,
	opts?: PredefinedApiKeyOptions,
): Promise<ApiKey | null> {
	return getCachedApiKey(ctx, "id", id, cacheKeyById(id), opts);
}

async function getCachedApiKey(
	ctx: GenericEndpointContext,
	field: "key" | "id",
	value: string,
	cacheKey: string,
	opts?: PredefinedApiKeyOptions,
): Promise<ApiKey | null> {
	const cache = opts && getCache(ctx, opts);
	if (cache && opts) {
		const cached = deserializeApiKey(await cache.get(cacheKey));
		if (
			cached?.[field] === value &&
			configIdMatches(cached.configId, opts.configId)
		) {
			return cached;
		}
	}

	const apiKey = await ctx.context.adapter.findOne<ApiKey>({
		model: "apikey",
		where: [{ field, value }],
	});
	if (apiKey && opts) await setApiKey(ctx, apiKey, opts);
	return apiKey;
}

export async function setApiKey(
	ctx: GenericEndpointContext,
	apiKey: ApiKey,
	opts: PredefinedApiKeyOptions,
): Promise<void> {
	const cache = getCache(ctx, opts);
	if (
		!cache ||
		!configIdMatches(apiKey.configId, opts.configId) ||
		needsMetadataMigration(apiKey.metadata)
	) {
		return;
	}

	const ttl = apiKey.expiresAt
		? Math.floor((apiKey.expiresAt.getTime() - Date.now()) / 1000)
		: 0;
	const value = JSON.stringify(apiKey);
	await Promise.all([
		cache.set(cacheKeyByHash(apiKey.key), value, ttl > 0 ? ttl : undefined),
		cache.set(cacheKeyById(apiKey.id), value, ttl > 0 ? ttl : undefined),
	]);
}

export async function invalidateApiKeyCache(
	ctx: GenericEndpointContext,
	apiKey: ApiKey,
	opts: PredefinedApiKeyOptions,
): Promise<void> {
	const cache = getCache(ctx, opts);
	if (!cache) return;

	await Promise.all([
		cache.delete(cacheKeyByHash(apiKey.key)),
		cache.delete(cacheKeyById(apiKey.id)),
	]);
}

export async function deleteApiKey(
	ctx: GenericEndpointContext,
	apiKey: ApiKey,
	opts: PredefinedApiKeyOptions,
): Promise<void> {
	await invalidateApiKeyCache(ctx, apiKey, opts);
	await ctx.context.adapter.delete({
		model: "apikey",
		where: [{ field: "id", value: apiKey.id }],
	});
}

export async function listApiKeys(
	ctx: GenericEndpointContext,
	where: Where[],
	page: {
		limit?: number | undefined;
		offset?: number | undefined;
		sortBy?: { field: string; direction: "asc" | "desc" } | undefined;
	},
): Promise<{ apiKeys: ApiKey[]; total: number }> {
	const adapter = ctx.context.adapter;
	const total = await adapter.count({ model: "apikey", where });
	if (page.limit === 0) return { apiKeys: [], total };

	let limit = page.limit ?? total + 1;
	for (;;) {
		const apiKeys = await adapter.findMany<ApiKey>({
			model: "apikey",
			where,
			...page,
			limit,
		});
		if (page.limit !== undefined || apiKeys.length < limit) {
			return {
				apiKeys,
				total:
					page.limit === undefined && !page.offset ? apiKeys.length : total,
			};
		}
		// A concurrent insert can make the count too small for an unbounded read.
		limit *= 2;
	}
}
