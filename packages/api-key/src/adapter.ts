import type { GenericEndpointContext } from "@better-auth/core";
import type { SecondaryStorage } from "@better-auth/core/db";
import { safeJSONParse } from "@better-auth/core/utils/json";
import type { PredefinedApiKeyOptions } from "./routes";
import type { ApiKey } from "./types";

/**
 * Parses double-stringified metadata synchronously without updating the database.
 * Use this for reading metadata, then call migrateLegacyMetadataInBackground for DB updates.
 *
 * @returns The properly parsed metadata object, or the original if already an object
 */
export function parseDoubleStringifiedMetadata(
	metadata: ApiKey["metadata"],
): Record<string, any> | null {
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
	return safeJSONParse<Record<string, any>>(metadata);
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
	opts: PredefinedApiKeyOptions,
): Promise<void> {
	// Only migrate for database storage
	if (opts.storage !== "database" && !opts.fallbackToDatabase) {
		return;
	}

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
	opts: PredefinedApiKeyOptions,
): Promise<Record<string, any> | null> {
	const parsed = parseDoubleStringifiedMetadata(apiKey.metadata);

	// Update the database to fix the legacy data (only for database storage)
	if (
		needsMetadataMigration(apiKey.metadata) &&
		(opts.storage === "database" || opts.fallbackToDatabase)
	) {
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

/**
 * Generate storage key for API key by hashed key
 */
function getStorageKeyByHashedKey(hashedKey: string): string {
	return `api-key:${hashedKey}`;
}

/**
 * Generate storage key for API key by ID
 */
function getStorageKeyById(id: string): string {
	return `api-key:by-id:${id}`;
}

/**
 * Generate storage key for reference's API key list (user or org)
 */
function getStorageKeyByReferenceId(referenceId: string): string {
	return `api-key:by-ref:${referenceId}`;
}

/**
 * Serialize API key for storage
 */
function serializeApiKey(apiKey: ApiKey): string {
	return JSON.stringify({
		...apiKey,
		createdAt: apiKey.createdAt.toISOString(),
		updatedAt: apiKey.updatedAt.toISOString(),
		expiresAt: apiKey.expiresAt?.toISOString() ?? null,
		lastRefillAt: apiKey.lastRefillAt?.toISOString() ?? null,
		lastRequest: apiKey.lastRequest?.toISOString() ?? null,
	});
}

/**
 * Deserialize API key from storage
 */
function deserializeApiKey(data: unknown): ApiKey | null {
	if (!data || typeof data !== "string") {
		return null;
	}

	try {
		const parsed = JSON.parse(data);
		return {
			...parsed,
			createdAt: new Date(parsed.createdAt),
			updatedAt: new Date(parsed.updatedAt),
			expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt) : null,
			lastRefillAt: parsed.lastRefillAt ? new Date(parsed.lastRefillAt) : null,
			lastRequest: parsed.lastRequest ? new Date(parsed.lastRequest) : null,
		} as ApiKey;
	} catch {
		return null;
	}
}

/**
 * Get the storage instance to use (custom methods take precedence)
 */
function getStorageInstance(
	ctx: GenericEndpointContext,
	opts: PredefinedApiKeyOptions,
): SecondaryStorage | null {
	if (opts.customStorage) {
		return opts.customStorage as SecondaryStorage;
	}
	return ctx.context.secondaryStorage || null;
}

/**
 * Calculate TTL in seconds for an API key
 */
function calculateTTL(apiKey: ApiKey): number | undefined {
	if (apiKey.expiresAt) {
		const now = Date.now();
		const expiresAt = new Date(apiKey.expiresAt).getTime();
		const ttlSeconds = Math.floor((expiresAt - now) / 1000);
		// Only set TTL if expiration is in the future
		if (ttlSeconds > 0) {
			return ttlSeconds;
		}
	}

	return undefined;
}

/**
 * Get API key from secondary storage by hashed key
 */
async function getApiKeyFromStorage(
	ctx: GenericEndpointContext,
	hashedKey: string,
	storage: SecondaryStorage,
): Promise<ApiKey | null> {
	const key = getStorageKeyByHashedKey(hashedKey);
	const data = await storage.get(key);
	return deserializeApiKey(data);
}

/**
 * Get API key from secondary storage by ID
 */
async function getApiKeyByIdFromStorage(
	ctx: GenericEndpointContext,
	id: string,
	storage: SecondaryStorage,
): Promise<ApiKey | null> {
	const key = getStorageKeyById(id);
	const data = await storage.get(key);
	return deserializeApiKey(data);
}

/**
 * Read-modify-write the ref list:
 * used only when the list is the source of truth.
 */
async function modifyRefList(
	storage: SecondaryStorage,
	refKey: string,
	modify: (ids: string[]) => string[],
): Promise<void> {
	const refListData = await storage.get(refKey);
	let keyIds: string[] = [];
	if (refListData && typeof refListData === "string") {
		try {
			keyIds = JSON.parse(refListData);
		} catch {
			keyIds = [];
		}
	} else if (Array.isArray(refListData)) {
		keyIds = refListData;
	}
	const next = modify(keyIds);
	if (next.length === 0) {
		await storage.delete(refKey);
	} else {
		await storage.set(refKey, JSON.stringify(next));
	}
}

async function setApiKeyInStorage(
	_ctx: GenericEndpointContext,
	apiKey: ApiKey,
	storage: SecondaryStorage,
	ttl: number | undefined,
	opts: PredefinedApiKeyOptions,
): Promise<void> {
	const serialized = serializeApiKey(apiKey);
	const refKey = getStorageKeyByReferenceId(apiKey.referenceId);

	// Fallback mode:
	// the ref list is a cache,
	// so invalidate instead of RMW to avoid concurrent-writer races.
	if (opts.fallbackToDatabase) {
		await Promise.all([
			storage.set(getStorageKeyByHashedKey(apiKey.key), serialized, ttl),
			storage.set(getStorageKeyById(apiKey.id), serialized, ttl),
			storage.delete(refKey),
		]);
		return;
	}

	await Promise.all([
		storage.set(getStorageKeyByHashedKey(apiKey.key), serialized, ttl),
		storage.set(getStorageKeyById(apiKey.id), serialized, ttl),
		modifyRefList(storage, refKey, (ids) =>
			ids.includes(apiKey.id) ? ids : [...ids, apiKey.id],
		),
	]);
}

/**
 * Delete API key from secondary storage
 */
async function deleteApiKeyFromStorage(
	ctx: GenericEndpointContext,
	apiKey: ApiKey,
	storage: SecondaryStorage,
	opts: PredefinedApiKeyOptions,
): Promise<void> {
	const refKey = getStorageKeyByReferenceId(apiKey.referenceId);

	// Mirror setApiKeyInStorage:
	// invalidate in fallback mode, RMW otherwise.
	if (opts.fallbackToDatabase) {
		await Promise.all([
			storage.delete(getStorageKeyByHashedKey(apiKey.key)),
			storage.delete(getStorageKeyById(apiKey.id)),
			storage.delete(refKey),
		]);
		return;
	}

	await Promise.all([
		storage.delete(getStorageKeyByHashedKey(apiKey.key)),
		storage.delete(getStorageKeyById(apiKey.id)),
		modifyRefList(storage, refKey, (ids) =>
			ids.filter((keyId) => keyId !== apiKey.id),
		),
	]);
}

/**
 * Unified getter for API keys with support for all storage modes
 */
export async function getApiKey(
	ctx: GenericEndpointContext,
	hashedKey: string,
	opts: PredefinedApiKeyOptions,
): Promise<ApiKey | null> {
	const storage = getStorageInstance(ctx, opts);

	// Database mode only
	if (opts.storage === "database") {
		return await ctx.context.adapter.findOne<ApiKey>({
			model: "apikey",
			where: [
				{
					field: "key",
					value: hashedKey,
				},
			],
		});
	}

	// Secondary storage mode with fallback
	if (opts.storage === "secondary-storage" && opts.fallbackToDatabase) {
		if (storage) {
			const cached = await getApiKeyFromStorage(ctx, hashedKey, storage);
			if (cached) {
				return cached;
			}
		}
		const dbKey = await ctx.context.adapter.findOne<ApiKey>({
			model: "apikey",
			where: [
				{
					field: "key",
					value: hashedKey,
				},
			],
		});

		if (dbKey && storage) {
			// Populate secondary storage for future reads
			const ttl = calculateTTL(dbKey);
			await setApiKeyInStorage(ctx, dbKey, storage, ttl, opts);
		}

		return dbKey;
	}

	// Secondary storage mode only
	if (opts.storage === "secondary-storage") {
		if (!storage) {
			return null;
		}
		return await getApiKeyFromStorage(ctx, hashedKey, storage);
	}

	// Default fallback
	return await ctx.context.adapter.findOne<ApiKey>({
		model: "apikey",
		where: [
			{
				field: "key",
				value: hashedKey,
			},
		],
	});
}

/**
 * Unified getter for API keys by ID
 */
export async function getApiKeyById(
	ctx: GenericEndpointContext,
	id: string,
	opts: PredefinedApiKeyOptions,
): Promise<ApiKey | null> {
	const storage = getStorageInstance(ctx, opts);

	// Database mode only
	if (opts.storage === "database") {
		return await ctx.context.adapter.findOne<ApiKey>({
			model: "apikey",
			where: [
				{
					field: "id",
					value: id,
				},
			],
		});
	}

	// Secondary storage mode with fallback
	if (opts.storage === "secondary-storage" && opts.fallbackToDatabase) {
		if (storage) {
			const cached = await getApiKeyByIdFromStorage(ctx, id, storage);
			if (cached) {
				return cached;
			}
		}
		const dbKey = await ctx.context.adapter.findOne<ApiKey>({
			model: "apikey",
			where: [
				{
					field: "id",
					value: id,
				},
			],
		});

		if (dbKey && storage) {
			// Populate secondary storage for future reads
			const ttl = calculateTTL(dbKey);
			await setApiKeyInStorage(ctx, dbKey, storage, ttl, opts);
		}

		return dbKey;
	}

	// Secondary storage mode only
	if (opts.storage === "secondary-storage") {
		if (!storage) {
			return null;
		}
		return await getApiKeyByIdFromStorage(ctx, id, storage);
	}

	// Default fallback
	return await ctx.context.adapter.findOne<ApiKey>({
		model: "apikey",
		where: [
			{
				field: "id",
				value: id,
			},
		],
	});
}

/**
 * Unified setter for API keys with support for all storage modes
 */
export async function setApiKey(
	ctx: GenericEndpointContext,
	apiKey: ApiKey,
	opts: PredefinedApiKeyOptions,
): Promise<void> {
	const storage = getStorageInstance(ctx, opts);
	const ttl = calculateTTL(apiKey);

	// Database mode only - handled by adapter in route handlers
	if (opts.storage === "database") {
		return;
	}

	// Secondary storage mode (with or without fallback)
	if (opts.storage === "secondary-storage") {
		if (!storage) {
			throw new Error(
				"Secondary storage is required when storage mode is 'secondary-storage'",
			);
		}
		await setApiKeyInStorage(ctx, apiKey, storage, ttl, opts);
		return;
	}
}

/**
 * Unified deleter for API keys with support for all storage modes
 */
export async function deleteApiKey(
	ctx: GenericEndpointContext,
	apiKey: ApiKey,
	opts: PredefinedApiKeyOptions,
): Promise<void> {
	const storage = getStorageInstance(ctx, opts);

	// Database mode only - handled by adapter in route handlers
	if (opts.storage === "database") {
		return;
	}

	// Secondary storage mode (with or without fallback)
	if (opts.storage === "secondary-storage") {
		if (!storage) {
			throw new Error(
				"Secondary storage is required when storage mode is 'secondary-storage'",
			);
		}
		await deleteApiKeyFromStorage(ctx, apiKey, storage, opts);
		return;
	}
}

export interface ListApiKeysOptions {
	limit?: number;
	offset?: number;
	sortBy?: string;
	sortDirection?: "asc" | "desc";
}

export interface ListApiKeysResult {
	apiKeys: ApiKey[];
	total: number;
}

/**
 * Apply sorting and pagination to an array of API keys in memory
 * Used for secondary storage mode where we can't rely on database operations
 */
function applySortingAndPagination(
	apiKeys: ApiKey[],
	sortBy?: string,
	sortDirection?: "asc" | "desc",
	limit?: number,
	offset?: number,
): ApiKey[] {
	let result = [...apiKeys];

	// Apply sorting if sortBy is specified
	if (sortBy) {
		const direction = sortDirection || "asc";
		result.sort((a, b) => {
			const aValue = a[sortBy as keyof ApiKey];
			const bValue = b[sortBy as keyof ApiKey];

			// Handle null/undefined values
			if (aValue == null && bValue == null) return 0;
			if (aValue == null) return direction === "asc" ? -1 : 1;
			if (bValue == null) return direction === "asc" ? 1 : -1;

			// Compare values
			if (aValue < bValue) return direction === "asc" ? -1 : 1;
			if (aValue > bValue) return direction === "asc" ? 1 : -1;
			return 0;
		});
	}

	// Apply pagination
	if (offset !== undefined) {
		result = result.slice(offset);
	}
	if (limit !== undefined) {
		result = result.slice(0, limit);
	}

	return result;
}

/**
 * List API keys for a reference (user or org) with support for all storage modes
 */
export async function listApiKeys(
	ctx: GenericEndpointContext,
	referenceId: string,
	opts: PredefinedApiKeyOptions,
	paginationOpts?: ListApiKeysOptions,
): Promise<ListApiKeysResult> {
	const storage = getStorageInstance(ctx, opts);
	const { limit, offset, sortBy, sortDirection } = paginationOpts || {};

	// Database mode only
	if (opts.storage === "database") {
		const [apiKeys, total] = await Promise.all([
			ctx.context.adapter.findMany<ApiKey>({
				model: "apikey",
				where: [
					{
						field: "referenceId",
						value: referenceId,
					},
				],
				limit,
				offset,
				sortBy: sortBy
					? { field: sortBy, direction: sortDirection || "asc" }
					: undefined,
			}),
			ctx.context.adapter.count({
				model: "apikey",
				where: [
					{
						field: "referenceId",
						value: referenceId,
					},
				],
			}),
		]);
		return { apiKeys, total };
	}

	// Secondary storage mode with fallback
	if (opts.storage === "secondary-storage" && opts.fallbackToDatabase) {
		const refKey = getStorageKeyByReferenceId(referenceId);

		if (storage) {
			const refListData = await storage.get(refKey);
			let keyIds: string[] = [];

			if (refListData && typeof refListData === "string") {
				try {
					keyIds = JSON.parse(refListData);
				} catch {
					keyIds = [];
				}
			} else if (Array.isArray(refListData)) {
				keyIds = refListData;
			}

			if (keyIds.length > 0) {
				const results = await Promise.all(
					keyIds.map((id) => getApiKeyByIdFromStorage(ctx, id, storage)),
				);
				const apiKeys = results.filter(
					(key): key is ApiKey => key !== null && key !== undefined,
				);
				// Apply sorting and pagination in memory for secondary storage
				const sortedKeys = applySortingAndPagination(
					apiKeys,
					sortBy,
					sortDirection,
					limit,
					offset,
				);
				return { apiKeys: sortedKeys, total: apiKeys.length };
			}
		}
		// Fallback to database
		const [dbKeys, total] = await Promise.all([
			ctx.context.adapter.findMany<ApiKey>({
				model: "apikey",
				where: [
					{
						field: "referenceId",
						value: referenceId,
					},
				],
				limit,
				offset,
				sortBy: sortBy
					? { field: sortBy, direction: sortDirection || "asc" }
					: undefined,
			}),
			ctx.context.adapter.count({
				model: "apikey",
				where: [
					{
						field: "referenceId",
						value: referenceId,
					},
				],
			}),
		]);

		// Rebuild from DB truth:
		// per-key entries fan out,
		// ref list is written last with the full id set.
		if (storage && dbKeys.length > 0) {
			await Promise.all(
				dbKeys.map((apiKey) =>
					setApiKeyInStorage(ctx, apiKey, storage, calculateTTL(apiKey), opts),
				),
			);
			const keyIds = dbKeys.map((apiKey) => apiKey.id);
			await storage.set(refKey, JSON.stringify(keyIds));
		}

		return { apiKeys: dbKeys, total };
	}

	// Secondary storage mode only
	if (opts.storage === "secondary-storage") {
		if (!storage) {
			return { apiKeys: [], total: 0 };
		}

		const refKey = getStorageKeyByReferenceId(referenceId);
		const refListData = await storage.get(refKey);
		let keyIds: string[] = [];

		if (refListData && typeof refListData === "string") {
			try {
				keyIds = JSON.parse(refListData);
			} catch {
				return { apiKeys: [], total: 0 };
			}
		} else if (Array.isArray(refListData)) {
			keyIds = refListData;
		} else {
			return { apiKeys: [], total: 0 };
		}

		const results = await Promise.all(
			keyIds.map((id) => getApiKeyByIdFromStorage(ctx, id, storage)),
		);
		const apiKeys = results.filter(
			(key): key is ApiKey => key !== null && key !== undefined,
		);

		// Apply sorting and pagination in memory for secondary storage
		const sortedKeys = applySortingAndPagination(
			apiKeys,
			sortBy,
			sortDirection,
			limit,
			offset,
		);
		return { apiKeys: sortedKeys, total: apiKeys.length };
	}

	// Default fallback
	const [apiKeys, total] = await Promise.all([
		ctx.context.adapter.findMany<ApiKey>({
			model: "apikey",
			where: [
				{
					field: "referenceId",
					value: referenceId,
				},
			],
			limit,
			offset,
			sortBy: sortBy
				? { field: sortBy, direction: sortDirection || "asc" }
				: undefined,
		}),
		ctx.context.adapter.count({
			model: "apikey",
			where: [
				{
					field: "referenceId",
					value: referenceId,
				},
			],
		}),
	]);
	return { apiKeys, total };
}
