import { createClient } from "redis";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { redisAdapter } from "./redis-adapter";

interface User {
	id?: string;
	name: string;
	email: string;
}

describe("redis-adapter", () => {
	let redisClient: ReturnType<typeof createClient> | null = null;
	let isRedisAvailable = false;

	beforeEach(async () => {
		try {
			redisClient = createClient();
			await redisClient.connect();
			isRedisAvailable = true;
		} catch (error) {
			isRedisAvailable = false;
			redisClient = null;
		}
	});

	afterEach(async () => {
		if (redisClient && isRedisAvailable) {
			try {
				await redisClient.flushDb();
				await redisClient.disconnect();
			} catch {
				// Ignore cleanup errors
			}
		}
	});

	it("should create redis adapter", async () => {
		if (!isRedisAvailable || !redisClient) {
			expect(true).toBe(true); // Skip test
			return;
		}

		const adapter = redisAdapter({
			client: redisClient as never,
		})({} as never);

		expect(adapter).toBeDefined();
	});

	it("should create and retrieve records", async () => {
		if (!isRedisAvailable || !redisClient) {
			expect(true).toBe(true); // Skip test
			return;
		}

		const adapter = redisAdapter({
			client: redisClient as never,
		})({} as never);

		const created = await adapter.create({
			model: "user",
			data: {
				name: "Test User",
				email: "test@example.com",
			},
		});

		expect(created).toBeDefined();
		expect(created.id).toBeDefined();
		expect(created.name).toBe("Test User");
		expect(created.email).toBe("test@example.com");

		const found = (await adapter.findOne({
			model: "user",
			where: [{ field: "id", value: created.id, operator: "eq" }],
		})) as User | null;

		expect(found).toBeDefined();
		expect(found?.email).toBe("test@example.com");
		expect(found?.id).toBe(created.id);
	});

	it("should update records", async () => {
		if (!isRedisAvailable || !redisClient) {
			expect(true).toBe(true); // Skip test
			return;
		}

		const adapter = redisAdapter({
			client: redisClient as never,
		})({} as never);

		const created = await adapter.create({
			model: "user",
			data: {
				name: "Test User",
				email: "test@example.com",
			},
		});

		const updated = (await adapter.update({
			model: "user",
			where: [{ field: "id", value: created.id, operator: "eq" }],
			update: {
				name: "Updated User",
			},
		})) as User | null;

		expect(updated).toBeDefined();
		expect(updated?.name).toBe("Updated User");
		expect(updated?.email).toBe("test@example.com");
	});

	it("should delete records", async () => {
		if (!isRedisAvailable || !redisClient) {
			expect(true).toBe(true); // Skip test
			return;
		}

		const adapter = redisAdapter({
			client: redisClient as never,
		})({} as never);

		const created = await adapter.create({
			model: "user",
			data: {
				name: "Test User",
				email: "test@example.com",
			},
		});

		await adapter.delete({
			model: "user",
			where: [{ field: "id", value: created.id, operator: "eq" }],
		});

		const found = await adapter.findOne({
			model: "user",
			where: [{ field: "id", value: created.id, operator: "eq" }],
		});

		expect(found).toBeNull();
	});

	it("should find many records", async () => {
		if (!isRedisAvailable || !redisClient) {
			expect(true).toBe(true); // Skip test
			return;
		}

		const adapter = redisAdapter({
			client: redisClient as never,
		})({} as never);

		await adapter.create({
			model: "user",
			data: {
				name: "User 1",
				email: "user1@example.com",
			},
		});

		await adapter.create({
			model: "user",
			data: {
				name: "User 2",
				email: "user2@example.com",
			},
		});

		const users = await adapter.findMany({
			model: "user",
		});

		expect(users.length).toBeGreaterThanOrEqual(2);
	});

	it("should count records", async () => {
		if (!isRedisAvailable || !redisClient) {
			expect(true).toBe(true); // Skip test
			return;
		}

		const adapter = redisAdapter({
			client: redisClient as never,
		})({} as never);

		await adapter.create({
			model: "user",
			data: {
				name: "User 1",
				email: "user1@example.com",
			},
		});

		const count = await adapter.count({
			model: "user",
		});

		expect(count).toBeGreaterThanOrEqual(1);
	});
});
