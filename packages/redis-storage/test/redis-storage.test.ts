import { describe, expect, it, vi } from "vitest";
import { redisStorage } from "../src/redis-storage";

describe("redisStorage", () => {
	it("uses an atomic Lua get-and-delete operation", async () => {
		const evalMock = vi.fn().mockResolvedValue("stored-value");
		const storage = redisStorage({
			client: {
				eval: evalMock,
			} as any,
			keyPrefix: "ba:",
		});

		await expect(storage.getAndDelete("verification-key")).resolves.toBe(
			"stored-value",
		);
		expect(evalMock).toHaveBeenCalledWith(
			expect.stringContaining('redis.call("GET", KEYS[1])'),
			1,
			"ba:verification-key",
		);
	});
});
