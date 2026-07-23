import type { SecondaryStorage } from "@better-auth/core/db";
import type Redis from "ioredis";

export interface RedisStorageConfig {
	/**
	 * Redis client instance from ioredis
	 */
	client: Redis;
	/**
	 * Optional key prefix for all keys stored in Redis
	 * @default "better-auth:"
	 */
	keyPrefix?: string | undefined;
}

/**
 * Creates a Redis secondary storage for Better Auth using ioredis.
 *
 * @example
 * ```ts
 * import { Redis } from "ioredis";
 * import { redisStorage } from "@better-auth/redis-storage";
 *
 * const redis = new Redis({
 *   host: "localhost",
 *   port: 6379,
 * });
 *
 * const auth = betterAuth({
 *   secondaryStorage: redisStorage({ client: redis }),
 * });
 * ```
 *
 * @param config - Configuration object containing the Redis client and optional key prefix
 * @returns SecondaryStorage implementation for Better Auth
 */
export function redisStorage(config: RedisStorageConfig) {
	const { client, keyPrefix = "better-auth:" } = config;
	let supportsGetDel = true;
	const getAndDeleteScript = `
local value = redis.call("GET", KEYS[1])
if value ~= false then
  redis.call("DEL", KEYS[1])
end
return value
`;
	// INCR then set EXPIRE only when the counter was just created (value == 1),
	// so the TTL window is fixed from first creation and never extended.
	const incrementScript = `
local value = redis.call("INCR", KEYS[1])
if value == 1 then
  redis.call("EXPIRE", KEYS[1], ARGV[1])
end
return value
`;

	const prefixKey = (key: string): string => {
		return `${keyPrefix}${key}`;
	};
	const isUnknownCommandError = (error: unknown) =>
		error instanceof Error &&
		error.message.toLowerCase().includes("unknown command");

	// How many keys Redis samples per SCAN round-trip. A hint, not a limit.
	const SCAN_COUNT = 100;

	// Iterate every prefixed key with SCAN instead of KEYS. KEYS walks the
	// entire keyspace in a single blocking call, which stalls the Redis
	// server on large datasets; SCAN pages through the keyspace cursor by
	// cursor without blocking. SCAN may return the same key in more than one
	// page, so consumers that need uniqueness must dedupe. Each yielded batch
	// is non-empty.
	async function* scanBatches(): AsyncGenerator<string[]> {
		let cursor = "0";
		do {
			const [nextCursor, batch] = await client.scan(
				cursor,
				"MATCH",
				`${keyPrefix}*`,
				"COUNT",
				SCAN_COUNT,
			);
			cursor = nextCursor;
			if (batch.length > 0) {
				yield batch;
			}
		} while (cursor !== "0");
	}

	return {
		async get(key: string) {
			return client.get(prefixKey(key));
		},

		async getAndDelete(key: string) {
			const prefixedKey = prefixKey(key);
			if (supportsGetDel) {
				try {
					return await client.call("GETDEL", prefixedKey);
				} catch (error) {
					if (!isUnknownCommandError(error)) {
						throw error;
					}
					supportsGetDel = false;
				}
			}
			// TODO(redis-6.2-required): require Redis >= 6.2 in the next
			// breaking branch and remove this Lua compatibility fallback.
			return client.eval(getAndDeleteScript, 1, prefixedKey);
		},

		async increment(key: string, ttl: number) {
			const value = await client.eval(incrementScript, 1, prefixKey(key), ttl);
			return Number(value);
		},

		async set(key: string, value: string, ttl?: number | undefined) {
			const prefixedKey = prefixKey(key);
			if (ttl !== undefined && ttl > 0) {
				await client.setex(prefixedKey, ttl, value);
			} else {
				await client.set(prefixedKey, value);
			}
		},

		async delete(key: string) {
			await client.del(prefixKey(key));
		},

		async listKeys(): Promise<string[]> {
			const keys = new Set<string>();
			for await (const batch of scanBatches()) {
				for (const key of batch) {
					keys.add(key.slice(keyPrefix.length));
				}
			}
			return [...keys];
		},

		async clear(): Promise<void> {
			// Batches from `scanBatches` are always non-empty, so DEL always
			// receives at least one key and an empty store is a safe no-op.
			for await (const batch of scanBatches()) {
				await client.del(...batch);
			}
		},
	} satisfies SecondaryStorage & {
		listKeys: () => Promise<string[]>;
		clear: () => Promise<void>;
	};
}
