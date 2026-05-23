import { describe, expect, it, vi } from "vitest";
import { redisStorage } from "../src/redis-storage";

describe("redisStorage", () => {
	it("uses GETDEL when it is supported", async () => {
		const callMock = vi.fn().mockResolvedValue("stored-value");
		const evalMock = vi.fn();
		const storage = redisStorage({
			client: {
				call: callMock,
				eval: evalMock,
			} as any,
			keyPrefix: "ba:",
		});

		await expect(storage.getAndDelete("verification-key")).resolves.toBe(
			"stored-value",
		);
		expect(callMock).toHaveBeenCalledWith("GETDEL", "ba:verification-key");
		expect(evalMock).not.toHaveBeenCalled();
	});

	it("falls back to Lua when GETDEL is unavailable", async () => {
		const callMock = vi
			.fn()
			.mockRejectedValueOnce(new Error("ERR unknown command 'GETDEL'"));
		const evalMock = vi.fn().mockResolvedValue("stored-value");
		const storage = redisStorage({
			client: {
				call: callMock,
				eval: evalMock,
			} as any,
			keyPrefix: "ba:",
		});

		await expect(storage.getAndDelete("verification-key")).resolves.toBe(
			"stored-value",
		);
		await expect(storage.getAndDelete("other-verification-key")).resolves.toBe(
			"stored-value",
		);
		expect(callMock).toHaveBeenCalledTimes(1);
		expect(evalMock).toHaveBeenCalledWith(
			expect.stringContaining('redis.call("GET", KEYS[1])'),
			1,
			"ba:verification-key",
		);
		expect(evalMock).toHaveBeenCalledWith(
			expect.stringContaining('redis.call("GET", KEYS[1])'),
			1,
			"ba:other-verification-key",
		);
	});

	it("rethrows GETDEL errors that are not unknown-command errors", async () => {
		const callError = new Error("Authentication required");
		const callMock = vi.fn().mockRejectedValue(callError);
		const evalMock = vi.fn();
		const storage = redisStorage({
			client: {
				call: callMock,
				eval: evalMock,
			} as any,
			keyPrefix: "ba:",
		});

		await expect(storage.getAndDelete("verification-key")).rejects.toThrow(
			callError,
		);
		expect(evalMock).not.toHaveBeenCalled();
	});
});
