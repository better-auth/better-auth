import type { GenericEndpointContext } from "@better-auth/core";
import type { SecondaryStorage } from "@better-auth/core/db";
import type { PredefinedApiKeyOptions } from "./routes";
import type { ApiKey } from "./types";

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
 * Generate storage key for user's API key list
 */
function getStorageKeyByUserId(userId: string): string {
	return `api-key:by-user:${userId}`;
}

/**
 * Generate storage key for reference's API key list
 */
function getStorageKeyByReferenceId(referenceId: string): string {
	return `api-key:by-reference:${referenceId}`;
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
 * Store API key in secondary storage
 */
async function setApiKeyInStorage(
	ctx: GenericEndpointContext,
	apiKey: ApiKey,
	storage: SecondaryStorage,
	ttl?: number | undefined,
): Promise<void> {
	const serialized = serializeApiKey(apiKey);
	const hashedKey = apiKey.key;
	const id = apiKey.id;

	// Store by hashed key (primary lookup)
	await storage.set(getStorageKeyByHashedKey(hashedKey), serialized, ttl);

	// Store by ID (for ID-based lookups)
	await storage.set(getStorageKeyById(id), serialized, ttl);

	// Update user's API key list
	if (apiKey.userId) {
		const userKey = getStorageKeyByUserId(apiKey.userId);
		const userListData = await storage.get(userKey);
		let userIds: string[] = [];

		if (userListData && typeof userListData === "string") {
			try {
				userIds = JSON.parse(userListData);
			} catch {
				userIds = [];
			}
		} else if (Array.isArray(userListData)) {
			userIds = userListData;
		}

		if (!userIds.includes(id)) {
			userIds.push(id);
			await storage.set(userKey, JSON.stringify(userIds));
		}
	}

	// Update reference's API key list
	if (apiKey.referenceId) {
		const referenceKey = getStorageKeyByReferenceId(apiKey.referenceId);
		const referenceListData = await storage.get(referenceKey);
		let referenceIds: string[] = [];

		if (referenceListData && typeof referenceListData === "string") {
			try {
				referenceIds = JSON.parse(referenceListData);
			} catch {
				referenceIds = [];
			}
		} else if (Array.isArray(referenceListData)) {
			referenceIds = referenceListData;
		}

		if (!referenceIds.includes(id)) {
			referenceIds.push(id);
			await storage.set(referenceKey, JSON.stringify(referenceIds));
		}
	}
}

/**
 * Delete API key from secondary storage
 */
async function deleteApiKeyFromStorage(
	ctx: GenericEndpointContext,
	apiKey: ApiKey,
	storage: SecondaryStorage,
): Promise<void> {
	const hashedKey = apiKey.key;
	const id = apiKey.id;
	const userId = apiKey.userId;

	// Delete by hashed key
	await storage.delete(getStorageKeyByHashedKey(hashedKey));

	// Delete by ID
	await storage.delete(getStorageKeyById(id));

	// Update user's API key list
	if (userId) {
		const userKey = getStorageKeyByUserId(userId);
		const userListData = await storage.get(userKey);
		let userIds: string[] = [];

		if (userListData && typeof userListData === "string") {
			try {
				userIds = JSON.parse(userListData);
			} catch {
				userIds = [];
			}
		} else if (Array.isArray(userListData)) {
			userIds = userListData;
		}

		const filteredIds = userIds.filter((keyId) => keyId !== id);
		if (filteredIds.length === 0) {
			await storage.delete(userKey);
		} else {
			await storage.set(userKey, JSON.stringify(filteredIds));
		}
	}

	// Update reference's API key list
	if (apiKey.referenceId) {
		const referenceKey = getStorageKeyByReferenceId(apiKey.referenceId);
		const referenceListData = await storage.get(referenceKey);
		let referenceIds: string[] = [];

		if (referenceListData && typeof referenceListData === "string") {
			try {
				referenceIds = JSON.parse(referenceListData);
			} catch {
				referenceIds = [];
			}
		} else if (Array.isArray(referenceListData)) {
			referenceIds = referenceListData;
		}

		const filteredReferenceIds = referenceIds.filter((keyId) => keyId !== id);
		if (filteredReferenceIds.length === 0) {
			await storage.delete(referenceKey);
		} else {
			await storage.set(referenceKey, JSON.stringify(filteredReferenceIds));
		}
	}
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
			await setApiKeyInStorage(ctx, dbKey, storage, ttl);
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
			await setApiKeyInStorage(ctx, dbKey, storage, ttl);
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
		await setApiKeyInStorage(ctx, apiKey, storage, ttl);
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
		await deleteApiKeyFromStorage(ctx, apiKey, storage);
		return;
	}
}

/**
 * List API keys for a user with support for all storage modes
 */
export async function listApiKeys(
	ctx: GenericEndpointContext,
	filter: { userId?: string; referenceId?: string },
	opts: PredefinedApiKeyOptions,
): Promise<ApiKey[]> {
	const storage = getStorageInstance(ctx, opts);
	const { userId, referenceId } = filter;

	// Database mode only
	if (opts.storage === "database") {
		type ApiKeyWhereCondition = {
			field: string;
			value: string;
		};
		const where: ApiKeyWhereCondition[] = [];

		if (userId) {
			where.push({
				field: "userId",
				value: userId,
			});
		}
		if (referenceId) {
			where.push({
				field: "referenceId",
				value: referenceId,
			});
		}
		return await ctx.context.adapter.findMany<ApiKey>({
			model: "apikey",
			where,
		});
	}

	// Secondary storage mode with fallback
	if (opts.storage === "secondary-storage" && opts.fallbackToDatabase) {
		let storageKey: string | null = null;
		if (referenceId) {
			storageKey = getStorageKeyByReferenceId(referenceId);
		} else if (userId) {
			storageKey = getStorageKeyByUserId(userId);
		}

		if (storage && storageKey) {
			const listData = await storage.get(storageKey);
			let ids: string[] = [];

			if (listData && typeof listData === "string") {
				try {
					ids = JSON.parse(listData);
				} catch {
					ids = [];
				}
			} else if (Array.isArray(listData)) {
				ids = listData;
			}

			if (ids.length > 0) {
				const apiKeys: ApiKey[] = [];
				for (const id of ids) {
					const apiKey = await getApiKeyByIdFromStorage(ctx, id, storage);
					if (apiKey) {
						apiKeys.push(apiKey);
					}
				}
				return apiKeys;
			}
		}
		// Fallback to database
		const where: any[] = [];
		if (userId) {
			where.push({
				field: "userId",
				value: userId,
			});
		}
		if (referenceId) {
			where.push({
				field: "referenceId",
				value: referenceId,
			});
		}
		const dbKeys = await ctx.context.adapter.findMany<ApiKey>({
			model: "apikey",
			where,
		});

		// Populate secondary storage with fetched keys
		if (storage && dbKeys.length > 0 && storageKey) {
			const ids: string[] = [];
			for (const apiKey of dbKeys) {
				// Store each key in secondary storage
				const ttl = calculateTTL(apiKey);
				await setApiKeyInStorage(ctx, apiKey, storage, ttl);
				ids.push(apiKey.id);
			}
			// Update user's key list in secondary storage
			await storage.set(storageKey, JSON.stringify(ids));
		}

		return dbKeys;
	}

	// Secondary storage mode only
	if (opts.storage === "secondary-storage") {
		if (!storage) {
			return [];
		}

		let storageKey: string | null = null;
		if (referenceId) {
			storageKey = getStorageKeyByReferenceId(referenceId);
		} else if (userId) {
			storageKey = getStorageKeyByUserId(userId);
		}

		if (!storageKey) {
			return [];
		}

		const listData = await storage.get(storageKey);
		let ids: string[] = [];

		if (listData && typeof listData === "string") {
			try {
				ids = JSON.parse(listData);
			} catch {
				return [];
			}
		} else if (Array.isArray(listData)) {
			ids = listData;
		} else {
			return [];
		}

		const apiKeys: ApiKey[] = [];
		for (const id of ids) {
			const apiKey = await getApiKeyByIdFromStorage(ctx, id, storage);
			if (apiKey) {
				apiKeys.push(apiKey);
			}
		}

		return apiKeys;
	}

	// Default fallback
	const where: any[] = [];
	if (userId) {
		where.push({
			field: "userId",
			value: userId,
		});
	}
	if (referenceId) {
		where.push({
			field: "referenceId",
			value: referenceId,
		});
	}
	return await ctx.context.adapter.findMany<ApiKey>({
		model: "apikey",
		where,
	});
}
