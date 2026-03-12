import type { SecondaryStorage } from "@better-auth/core/db";
import type { Where } from "@better-auth/core/db/adapter";
import type { NonceStore } from "@slicekit/erc8128";

interface NonceAdapter {
	findOne(args: {
		model: string;
		where: Where[];
	}): Promise<Record<string, unknown> | null>;
	create(args: {
		model: string;
		data: Record<string, unknown>;
	}): Promise<Record<string, unknown>>;
	deleteMany(args: {
		model: string;
		where: Where[];
	}): Promise<number>;
}

const NONCE_KEY_PREFIX = "erc8128:nonce:";
const NONCE_MODEL = "erc8128Nonce";

type NonceStoreLogger = {
	error: (...params: any[]) => void;
};

function logNonceStoreError(
	logger: NonceStoreLogger | undefined,
	message: string,
	error: unknown,
) {
	logger?.error(message, error);
}

function getExpiryTimestamp(value: unknown): number | null {
	if (!value) {
		return null;
	}
	const expiresAt = new Date(value as string | number | Date);
	const timestamp = expiresAt.getTime();
	return Number.isNaN(timestamp) ? null : timestamp;
}

function isDuplicateKeyError(error: unknown): boolean {
	const seen = new Set<unknown>();
	const queue = [error];
	const duplicateCodes = new Set([
		"11000",
		"23505",
		"E11000",
		"ER_DUP_ENTRY",
		"P2002",
		"SQLITE_CONSTRAINT",
	]);

	while (queue.length > 0) {
		const current = queue.shift();
		if (!current || seen.has(current) || typeof current !== "object") {
			continue;
		}
		seen.add(current);

		const candidate = current as {
			code?: string | number;
			message?: string;
			cause?: unknown;
		};
		const code = candidate.code == null ? "" : String(candidate.code);
		if (duplicateCodes.has(code)) {
			return true;
		}
		if (
			typeof candidate.message === "string" &&
			/(duplicate key|duplicate entry|already exists|unique constraint|violates unique|SQLITE_CONSTRAINT)/i.test(
				candidate.message,
			)
		) {
			return true;
		}
		if ("cause" in candidate) {
			queue.push(candidate.cause);
		}
	}

	return false;
}

async function createNonceRecord(
	adapter: NonceAdapter,
	nonceKey: string,
	expiresAt: Date,
) {
	await adapter.create({
		model: NONCE_MODEL,
		data: {
			nonceKey,
			expiresAt,
		},
	});
}

/**
 * NonceStore backed by `secondaryStorage` (e.g. Redis).
 *
 * Uses `setIfNotExists` when available for atomic consumption. Otherwise it
 * falls back to `get`/`set`, which is not atomic but preserves compatibility
 * with generic `SecondaryStorage` implementations.
 */
export function createSecondaryStorageNonceStore(
	storage: SecondaryStorage,
	logger?: NonceStoreLogger,
): NonceStore {
	return {
		async consume(key: string, ttlSeconds: number): Promise<boolean> {
			const identifier = `${NONCE_KEY_PREFIX}${key}`;
			try {
				if (typeof storage.setIfNotExists === "function") {
					return await storage.setIfNotExists(identifier, "1", ttlSeconds);
				}
				const existing = await storage.get(identifier);
				if (existing) {
					return false;
				}
				await storage.set(identifier, "1", ttlSeconds);
				return true;
			} catch (error) {
				logNonceStoreError(
					logger,
					"ERC8128 nonce secondary storage consume failed",
					error,
				);
				return false;
			}
		},
	};
}

/**
 * Dual-write NonceStore: consumes from both `erc8128Nonce` and secondaryStorage.
 * Both must succeed for the nonce to be considered consumed.
 * Reads from secondaryStorage first (fast path), falls back to DB.
 */
export function createDualNonceStore(
	dbStore: NonceStore,
	ssStore: NonceStore,
): NonceStore {
	return {
		async consume(key: string, ttlSeconds: number): Promise<boolean> {
			// Check secondaryStorage first (fast)
			const ssResult = await ssStore.consume(key, ttlSeconds);
			if (!ssResult) {
				return false; // Already consumed in SS
			}
			// Also consume in DB for durability
			const dbResult = await dbStore.consume(key, ttlSeconds);
			return dbResult;
		},
	};
}

export function createMemoryNonceStore(): NonceStore {
	const fallback = new Map<string, number>();

	const consumeFromFallback = (
		identifier: string,
		ttlSeconds: number,
	): boolean => {
		const now = Date.now();
		for (const [key, expiresAt] of fallback) {
			if (expiresAt <= now) {
				fallback.delete(key);
			}
		}

		const existing = fallback.get(identifier);
		if (existing && existing > now) {
			return false;
		}

		fallback.set(identifier, now + ttlSeconds * 1000);
		return true;
	};

	return {
		async consume(key: string, ttlSeconds: number): Promise<boolean> {
			return consumeFromFallback(`${NONCE_KEY_PREFIX}${key}`, ttlSeconds);
		},
	};
}

export function createAdapterNonceStore(
	adapter: NonceAdapter,
	logger?: NonceStoreLogger,
): NonceStore {
	return {
		async consume(key: string, ttlSeconds: number): Promise<boolean> {
			const nonceKey = key;
			const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

			try {
				await createNonceRecord(adapter, nonceKey, expiresAt);
				return true;
			} catch (error) {
				if (!isDuplicateKeyError(error)) {
					logNonceStoreError(
						logger,
						"ERC8128 nonce database consume failed",
						error,
					);
					return false;
				}
			}

			try {
				const existing = await adapter.findOne({
					model: NONCE_MODEL,
					where: [{ field: "nonceKey", operator: "eq", value: nonceKey }],
				});
				const existingExpiresAt = getExpiryTimestamp(existing?.expiresAt);

				if (existingExpiresAt !== null && existingExpiresAt > Date.now()) {
					return false;
				}
				if (existing && existingExpiresAt === null) {
					logNonceStoreError(
						logger,
						"ERC8128 nonce row had an invalid expiry value",
						existing,
					);
					return false;
				}

				if (existing) {
					await adapter.deleteMany({
						model: NONCE_MODEL,
						where: [{ field: "nonceKey", operator: "eq", value: nonceKey }],
					});
				}
				await createNonceRecord(adapter, nonceKey, expiresAt);

				return true;
			} catch (error) {
				if (isDuplicateKeyError(error)) {
					return false;
				}
				logNonceStoreError(
					logger,
					"ERC8128 nonce database retry failed",
					error,
				);
				return false;
			}
		},
	};
}
