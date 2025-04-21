import { afterAll, beforeAll, describe } from "vitest";
import { redisAdapter } from "..";
import Redis from "ioredis";
import { runAdapterTest } from "../../test";

const redis = new Redis({
	host: "localhost",
	port: 6379,
});

describe("Adapter tests", async () => {
	beforeAll(async () => {
		await clearAll();
	});
	afterAll(async () => {
		await redis.quit();
	});
	await runAdapterTest({
		getAdapter: async (customOptions = {}) => {
			return redisAdapter(redis, {
				debugLogs: { isRunningAdapterTests: true },
			})(customOptions);
		},
	});
});

async function clearAll(): Promise<void> {
	try {
		// FLUSHDB clears all keys from the current database
		await redis.flushdb();
	} catch (error) {
		console.error("Error clearing Redis database:", error);
		throw error;
	}
}
