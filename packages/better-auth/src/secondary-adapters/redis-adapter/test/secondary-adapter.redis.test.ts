import { describe, it, expect, afterAll, beforeEach } from "vitest";
import { Redis } from "ioredis";
import { redisSecondaryAdapter } from "../redis-secondary-adapter";

const TEST_REDIS_URL = "redis://localhost:6379";
const client = new Redis(TEST_REDIS_URL);

const adapter = redisSecondaryAdapter({
	connectionString: TEST_REDIS_URL,
});

// Clear Redis after all tests and close connection
afterAll(async () => {
	await client.flushall();
	await client.quit();
});

// Clean Redis before each test to avoid cross-test pollution
beforeEach(async () => {
	await client.flushall();
});

describe("Redis Adapter", () => {
	it("sets and gets a key", async () => {
		await adapter.set("key", "value");
		const data = await client.get("key");
		expect(data).toBe("value");
	});

	it("sets a key with TTL", async () => {
		await adapter.set("key2", "value2", 2);
		const data = await client.get("key2");
		expect(data).toBe("value2");

		// Wait for key to expire
		await new Promise((r) => setTimeout(r, 3000));
		const expiredData = await client.get("key2");
		expect(expiredData).toBe(null);
	}, 5000); // 5 seconds timeout for the test

	it("gets an existing key", async () => {
		await client.set("key3", "value3");
		const data = await adapter.get("key3");
		expect(data).toBe("value3");
	});

	it("returns null for non-existent key", async () => {
		const data = await adapter.get("nonexistent");
		expect(data).toBe(null);
	});

	it("deletes a key", async () => {
		await client.set("key4", "value4");
		await adapter.delete("key4");
		const result = await client.get("key4");
		expect(result).toBe(null);
	});
});
