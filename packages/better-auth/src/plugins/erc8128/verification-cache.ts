import type { SecondaryStorage } from "@better-auth/core/db";
import type { Where } from "@better-auth/core/db/adapter";

export type CacheValue = {
	verified: true;
	expires: number;
};

export const DEFAULT_CACHE_SIZE = 10_000;
const CACHE_KEY_PREFIX = "erc8128:cache:";

export function getVerificationCacheStorageKey(key: string): string {
	return CACHE_KEY_PREFIX + key;
}

export function parseVerificationCacheValue(raw: unknown): CacheValue | null {
	if (typeof raw !== "string") {
		return null;
	}

	try {
		const parsed = JSON.parse(raw) as Partial<CacheValue>;
		if (parsed.verified !== true || typeof parsed.expires !== "number") {
			return null;
		}
		if (parsed.expires <= Math.floor(Date.now() / 1000)) {
			return null;
		}
		return {
			verified: true,
			expires: parsed.expires,
		};
	} catch {
		return null;
	}
}

function getExpiryTimestamp(value: unknown): number | null {
	if (!value) {
		return null;
	}

	const expiresAt = new Date(value as string | number | Date);
	const timestamp = expiresAt.getTime();
	return Number.isNaN(timestamp) ? null : timestamp;
}

/**
 * Unified interface for the replayable signature verification cache.
 *
 * This cache stores successful `verifyMessage` outcomes so replayable signatures
 * can skip repeated EOA recovery / ERC-1271 `isValidSignature` checks. Request
 * verification still runs fully on every request; this cache only avoids the
 * expensive cryptographic sub-step. It is a pure performance optimization.
 *
 * This is separate from (and should not be confused with):
 * - **Nonce store** — replay protection for non-replayable signatures; stored in
 *   the `erc8128Nonce` table via `nonce-store.ts`. Security-critical.
 * - **Signature invalidation** — stored in the `erc8128Invalidation` table.
 *   Security-critical (losing state would re-enable revoked signatures).
 */
export interface VerificationCacheOps {
	get(key: string): Promise<CacheValue | null>;
	set(data: {
		key: string;
		value: CacheValue;
		ttlSec: number;
		address: string;
		chainId: number;
		signatureHash: string;
		expiresAt: Date;
	}): Promise<void>;
	delete(key: string): Promise<void>;
	/** No-op retained for interface compatibility. */
	sweep(): void;
}

export interface VerificationCacheAdapter {
	findOne(args: {
		model: string;
		where: Where[];
	}): Promise<Record<string, unknown> | null>;
	create(args: {
		model: string;
		data: Record<string, unknown>;
	}): Promise<Record<string, unknown>>;
	update(args: {
		model: string;
		where: Where[];
		update: Record<string, unknown>;
	}): Promise<unknown>;
	deleteMany(args: { model: string; where: Where[] }): Promise<number>;
}

/**
 * Create cache ops for the resolved strategy.
 *
 * Strategy resolution:
 *   secondaryStorage available → use it (fastest, shared, TTL-managed)
 *   otherwise                  → DB via `erc8128VerificationCache`
 *
 * All implementations are resilient: cache failures are swallowed so they never
 * block request processing.
 */
export function createVerificationCacheOps(
	strategy: "secondary-storage" | "database",
	secondaryStorage: SecondaryStorage | undefined,
	adapter: VerificationCacheAdapter,
): VerificationCacheOps {
	// --- Strategy: secondaryStorage (e.g. Redis) ---
	// Entries are stored with a TTL matching the signature validity window.
	// sweep is a no-op because TTL handles expiry.
	if (strategy === "secondary-storage" && secondaryStorage) {
		return {
			async get(key) {
				try {
					return parseVerificationCacheValue(
						await secondaryStorage.get(getVerificationCacheStorageKey(key)),
					);
				} catch {
					return null;
				}
			},
			async set({ key, value, ttlSec }) {
				try {
					await secondaryStorage.set(
						getVerificationCacheStorageKey(key),
						JSON.stringify(value),
						ttlSec,
					);
				} catch {}
			},
			async delete(key) {
				try {
					await secondaryStorage.delete(getVerificationCacheStorageKey(key));
				} catch {}
			},
			sweep() {},
		};
	}

	// --- Strategy: DB (`erc8128VerificationCache`) ---
	// Reads and writes go directly to the persistent cache table so cache hits
	// work across requests and instances.
	return {
		async get(key) {
			try {
				const record = await adapter.findOne({
					model: "erc8128VerificationCache",
					where: [{ field: "cacheKey", operator: "eq", value: key }],
				});
				if (!record) return null;
				const expiresAtMs = getExpiryTimestamp(record.expiresAt);
				if (expiresAtMs == null || expiresAtMs <= Date.now()) {
					return null;
				}
				const parsed = {
					verified: true,
					expires: Math.floor(expiresAtMs / 1000),
				} satisfies CacheValue;
				return parsed;
			} catch {
				return null;
			}
		},
		async set(data) {
			const { key, address, chainId, signatureHash, expiresAt } = data;
			try {
				const existing = await adapter.findOne({
					model: "erc8128VerificationCache",
					where: [{ field: "cacheKey", operator: "eq", value: key }],
				});
				if (existing) {
					await adapter.update({
						model: "erc8128VerificationCache",
						where: [
							{ field: "id", operator: "eq", value: String(existing.id) },
						],
						update: {
							address,
							chainId,
							signatureHash,
							expiresAt,
						},
					});
				} else {
					await adapter.create({
						model: "erc8128VerificationCache",
						data: {
							cacheKey: key,
							address,
							chainId,
							signatureHash,
							expiresAt,
						},
					});
				}
			} catch {}
		},
		async delete(key) {
			try {
				await adapter.deleteMany({
					model: "erc8128VerificationCache",
					where: [{ field: "cacheKey", operator: "eq", value: key }],
				});
			} catch {}
		},
		sweep() {},
	};
}
