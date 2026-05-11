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

	const prefixKey = (key: string): string => {
		return `${keyPrefix}${key}`;
	};
	const isUnknownCommandError = (error: unknown) =>
		error instanceof Error &&
		error.message.toLowerCase().includes("unknown command");

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
			const keys = await client.keys(`${keyPrefix}*`);
			return keys.map((key) => key.replace(keyPrefix, ""));
		},

		async clear(): Promise<void> {
			const keys = await client.keys(`${keyPrefix}*`);
			await client.del(...keys);
		},
	} satisfies SecondaryStorage & {
		listKeys: () => Promise<string[]>;
		clear: () => Promise<void>;
	};
}
