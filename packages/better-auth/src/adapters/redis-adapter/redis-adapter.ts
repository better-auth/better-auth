import type { SecondaryStorage } from "../../types";
import { Redis } from "ioredis";

export interface RedisConfig {
	/**
	 * Redis connection string
	 *
	 * @example "redis://user:password@localhost:6379"
	 */
	connectionString: string;
}

class RedisAdapter implements SecondaryStorage {
	private readonly client: Redis;
	constructor(config: RedisConfig) {
		this.client = new Redis(config.connectionString);
	}

	/**
	 * Get a value from Redis
	 * @param key - Key to get
	 * @returns - Value of the key
	 */
	async get(key: string): Promise<string | null> {
		const value = await this.client.get(key);
		return value ? value : null;
	}

	/**
	 * Set a value in Redis
	 * @param key - Key to set
	 * @param value - Value to set
	 * @param ttl - Time to live in seconds
	 */
	async set(
		/**
		 * Key to store
		 */
		key: string,
		/**
		 * Value to store
		 */
		value: string,
		/**
		 * Time to live in seconds
		 */
		ttl?: number,
	): Promise<void> {
		if (ttl) await this.client.set(key, value, "EX", ttl);
		else await this.client.set(key, value);
	}

	/**
	 * Delete a value from Redis
	 * @param key - Key to delete
	 */
	async delete(key: string): Promise<void> {
		await this.client.del(key);
	}
}

export function redisAdapter(config: RedisConfig): RedisAdapter {
	return new RedisAdapter(config);
}
