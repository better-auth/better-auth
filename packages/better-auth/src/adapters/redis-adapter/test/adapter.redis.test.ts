import { expect, it, describe, afterAll } from "vitest";
import { Redis } from "ioredis";
import { redisAdapter } from "../redis-adapter";

const TEST_REDIS_URL = "redis://localhost:6379";

const client = new Redis(TEST_REDIS_URL);

const adapter = redisAdapter({
	connectionString: TEST_REDIS_URL,
});

afterAll(async () => {
	await client.flushall();
	await client.quit();
});

describe("Set key", async () => {
	await adapter.set("key", "value");

	it("key should exist", async () => {
		const data = await client.get("key");
		expect(data).toBe("value");
	});
});

describe("Set key with TTL to 2 seconds", async () => {
	await adapter.set("key2", "value2", 2);

	it("key should exist", async () => {
		const data = await client.get("key2");
		expect(data).toBe("value2");
		// Wait for 3 seconds
		await new Promise((resolve) => setTimeout(resolve, 3000));
		const data2 = await client.get("key2");
		expect(data2).toBe(null);
	});
});

describe("Get key", async () => {
	await client.set("key3", "value3");

	it("key should exist", async () => {
		const data = await adapter.get("key3");
		expect(data).toBe("value3");
	});

	it("key should not exist", async () => {
		const data = await adapter.get("invalidKey");
		expect(data).toBe(null);
	});
});

describe("Delete key", async () => {
	await client.set("key4", "value4");

	it("key should be deleted", async () => {
		await adapter.delete("key4");
		const result = await client.get("key4");
		expect(result).toBe(null);
	});
});
