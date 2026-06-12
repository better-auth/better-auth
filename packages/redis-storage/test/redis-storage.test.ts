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

	it("increments atomically and sets the ttl only on creation", async () => {
		const counters = new Map<string, number>();
		const ttlByKey = new Map<string, number>();
		const evalMock = vi.fn(
			async (_script: string, _numKeys: number, key: string, ttl: string) => {
				const next = (counters.get(key) ?? 0) + 1;
				counters.set(key, next);
				if (next === 1) {
					ttlByKey.set(key, Number(ttl));
				}
				return next;
			},
		);
		const storage = redisStorage({
			client: { eval: evalMock } as any,
			keyPrefix: "ba:",
		});

		await expect(storage.increment!("rate:1", 60)).resolves.toBe(1);
		expect(ttlByKey.get("ba:rate:1")).toBe(60);

		await expect(storage.increment!("rate:1", 60)).resolves.toBe(2);
		await expect(storage.increment!("rate:1", 60)).resolves.toBe(3);
		// TTL captured on creation must not be reset by later increments.
		expect(ttlByKey.get("ba:rate:1")).toBe(60);

		expect(evalMock).toHaveBeenCalledWith(
			expect.stringContaining('redis.call("INCR", KEYS[1])'),
			1,
			"ba:rate:1",
			60,
		);
	});

	it("only sets the ttl on the call that creates the key", async () => {
		const evalMock = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);
		const storage = redisStorage({
			client: { eval: evalMock } as any,
			keyPrefix: "ba:",
		});

		await expect(storage.increment!("rate:2", 30)).resolves.toBe(1);
		await expect(storage.increment!("rate:2", 30)).resolves.toBe(2);

		const script = evalMock.mock.calls[0]![0] as string;
		expect(script).toContain('redis.call("INCR", KEYS[1])');
		expect(script).toContain("== 1");
		expect(script).toContain('redis.call("EXPIRE"');
	});
});
