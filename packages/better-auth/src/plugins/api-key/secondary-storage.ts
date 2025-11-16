import type { GenericEndpointContext } from "@better-auth/core";
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
 * Get API key from secondary storage by hashed key
 */
export async function getApiKeyFromSecondaryStorage(
	ctx: GenericEndpointContext,
	hashedKey: string,
): Promise<ApiKey | null> {
	if (!ctx.context.secondaryStorage) {
		return null;
	}

	const key = getStorageKeyByHashedKey(hashedKey);
	const data = await ctx.context.secondaryStorage.get(key);
	return deserializeApiKey(data);
}

/**
 * Get API key from secondary storage by ID
 */
export async function getApiKeyByIdFromSecondaryStorage(
	ctx: GenericEndpointContext,
	id: string,
): Promise<ApiKey | null> {
	if (!ctx.context.secondaryStorage) {
		return null;
	}

	const key = getStorageKeyById(id);
	const data = await ctx.context.secondaryStorage.get(key);
	return deserializeApiKey(data);
}

/**
 * Store API key in secondary storage
 */
export async function setApiKeyInSecondaryStorage(
	ctx: GenericEndpointContext,
	apiKey: ApiKey,
): Promise<void> {
	if (!ctx.context.secondaryStorage) {
		return;
	}

	const serialized = serializeApiKey(apiKey);
	const hashedKey = apiKey.key;
	const id = apiKey.id;

	let ttl: number | undefined;
	if (apiKey.expiresAt) {
		const now = Date.now();
		const expiresAt = new Date(apiKey.expiresAt).getTime();
		const ttlSeconds = Math.floor((expiresAt - now) / 1000);
		// Only set TTL if expiration is in the future
		if (ttlSeconds > 0) {
			ttl = ttlSeconds;
		}
	}

	await ctx.context.secondaryStorage.set(
		getStorageKeyByHashedKey(hashedKey),
		serialized,
		ttl,
	);

	await ctx.context.secondaryStorage.set(
		getStorageKeyById(id),
		serialized,
		ttl,
	);

	// Update user's API key list
	const userKey = getStorageKeyByUserId(apiKey.userId);
	const userListData = await ctx.context.secondaryStorage.get(userKey);
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
		await ctx.context.secondaryStorage.set(userKey, JSON.stringify(userIds));
	}
}

/**
 * Delete API key from secondary storage
 */
export async function deleteApiKeyFromSecondaryStorage(
	ctx: GenericEndpointContext,
	apiKey: ApiKey,
): Promise<void> {
	if (!ctx.context.secondaryStorage) {
		return;
	}

	const hashedKey = apiKey.key;
	const id = apiKey.id;
	const userId = apiKey.userId;

	await ctx.context.secondaryStorage.delete(
		getStorageKeyByHashedKey(hashedKey),
	);

	await ctx.context.secondaryStorage.delete(getStorageKeyById(id));

	// Update user's API key list
	const userKey = getStorageKeyByUserId(userId);
	const userListData = await ctx.context.secondaryStorage.get(userKey);
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
		await ctx.context.secondaryStorage.delete(userKey);
	} else {
		await ctx.context.secondaryStorage.set(
			userKey,
			JSON.stringify(filteredIds),
		);
	}
}

/**
 * List API keys for a user from secondary storage
 */
export async function listApiKeysFromSecondaryStorage(
	ctx: GenericEndpointContext,
	userId: string,
): Promise<ApiKey[]> {
	if (!ctx.context.secondaryStorage) {
		return [];
	}

	const userKey = getStorageKeyByUserId(userId);
	const userListData = await ctx.context.secondaryStorage.get(userKey);
	let userIds: string[] = [];

	if (userListData && typeof userListData === "string") {
		try {
			userIds = JSON.parse(userListData);
		} catch {
			return [];
		}
	} else if (Array.isArray(userListData)) {
		userIds = userListData;
	} else {
		return [];
	}

	const apiKeys: ApiKey[] = [];
	for (const id of userIds) {
		const apiKey = await getApiKeyByIdFromSecondaryStorage(ctx, id);
		if (apiKey) {
			apiKeys.push(apiKey);
		}
	}

	return apiKeys;
}

/**
 * Update API key in secondary storage
 */
export async function updateApiKeyInSecondaryStorage(
	ctx: GenericEndpointContext,
	id: string,
	updates: Partial<ApiKey>,
): Promise<ApiKey | null> {
	if (!ctx.context.secondaryStorage) {
		return null;
	}

	const existing = await getApiKeyByIdFromSecondaryStorage(ctx, id);
	if (!existing) {
		return null;
	}

	const updated: ApiKey = {
		...existing,
		...updates,
		updatedAt: new Date(),
	};

	await setApiKeyInSecondaryStorage(ctx, updated);
	return updated;
}
