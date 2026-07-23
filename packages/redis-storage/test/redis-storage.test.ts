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

	it("clears every prefixed key by paging through SCAN", async () => {
		const scanMock = vi
			.fn()
			.mockResolvedValueOnce(["42", ["ba:session:1"]])
			.mockResolvedValueOnce(["0", ["ba:rate:1"]]);
		const delMock = vi.fn().mockResolvedValue(1);
		const keysMock = vi.fn();
		const storage = redisStorage({
			client: {
				scan: scanMock,
				del: delMock,
				keys: keysMock,
			} as any,
			keyPrefix: "ba:",
		});

		await expect(storage.clear()).resolves.toBeUndefined();
		// KEYS blocks the server on large keyspaces and must never be used.
		expect(keysMock).not.toHaveBeenCalled();
		expect(scanMock).toHaveBeenNthCalledWith(
			1,
			"0",
			"MATCH",
			"ba:*",
			"COUNT",
			100,
		);
		// The second call resumes from the cursor returned by the first.
		expect(scanMock).toHaveBeenNthCalledWith(
			2,
			"42",
			"MATCH",
			"ba:*",
			"COUNT",
			100,
		);
		expect(delMock).toHaveBeenCalledTimes(2);
		expect(delMock).toHaveBeenNthCalledWith(1, "ba:session:1");
		expect(delMock).toHaveBeenNthCalledWith(2, "ba:rate:1");
	});

	it("does not call DEL when clearing an empty store", async () => {
		const scanMock = vi.fn().mockResolvedValue(["0", []]);
		// Redis rejects DEL with zero keys ("ERR wrong number of arguments"),
		// so an empty clear must never reach the client.
		const delMock = vi
			.fn()
			.mockRejectedValue(
				new Error("ERR wrong number of arguments for 'del' command"),
			);
		const storage = redisStorage({
			client: {
				scan: scanMock,
				del: delMock,
			} as any,
			keyPrefix: "ba:",
		});

		await expect(storage.clear()).resolves.toBeUndefined();
		expect(scanMock).toHaveBeenCalledTimes(1);
		expect(delMock).not.toHaveBeenCalled();
	});

	it("propagates a mid-iteration failure, leaving earlier pages deleted", async () => {
		// clear() is documented as non-atomic: pages already deleted stay
		// deleted when a later page fails. This pins that contract so a future
		// change to atomic-only deletion is a conscious, tested decision.
		const scanMock = vi
			.fn()
			.mockResolvedValueOnce(["9", ["ba:session:1"]])
			.mockResolvedValueOnce(["0", ["ba:session:2"]]);
		const delMock = vi
			.fn()
			.mockResolvedValueOnce(1)
			.mockRejectedValueOnce(
				new Error("READONLY You can't write against a read only replica."),
			);
		const storage = redisStorage({
			client: { scan: scanMock, del: delMock } as any,
			keyPrefix: "ba:",
		});

		await expect(storage.clear()).rejects.toThrow("READONLY");
		// The first page was deleted before the second page threw.
		expect(delMock).toHaveBeenNthCalledWith(1, "ba:session:1");
		expect(delMock).toHaveBeenNthCalledWith(2, "ba:session:2");
	});

	it("lists keys via SCAN, stripping the prefix and deduping across pages", async () => {
		// SCAN may return the same key on more than one page; the deduped
		// result must still contain each key exactly once.
		const scanMock = vi
			.fn()
			.mockResolvedValueOnce(["7", ["ba:session:1", "ba:session:2"]])
			.mockResolvedValueOnce(["0", ["ba:session:2", "ba:rate:1"]]);
		const keysMock = vi.fn();
		const storage = redisStorage({
			client: {
				scan: scanMock,
				keys: keysMock,
			} as any,
			keyPrefix: "ba:",
		});

		await expect(storage.listKeys()).resolves.toEqual([
			"session:1",
			"session:2",
			"rate:1",
		]);
		expect(keysMock).not.toHaveBeenCalled();
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
