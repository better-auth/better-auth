import { afterAll, beforeAll, describe } from "vitest";
import { redisAdapter } from "..";
import { runAdapterTest } from "../../test";
import { createClient } from "redis";

const redis = await createClient({ url: "redis://localhost:6379" })
	.on("error", (err) => {
		console.error("Test Redis Adapter connection error:", err);
	})
	.connect();

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
		await redis.flushDb();
	} catch (error) {
		console.error("Error clearing Redis database:", error);
		throw error;
	}
}
