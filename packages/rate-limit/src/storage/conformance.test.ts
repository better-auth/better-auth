import { describe, expect, it } from "vitest";
import { evaluateRateLimit } from "../evaluate";
import type { RateLimitPolicy } from "../policy";
import {
	fixedWindow,
	gcra,
	slidingWindowCounter,
	tokenBucket,
} from "../policy";
import { createCasRateLimitStorage } from "./cas";
import { parseRateLimitState, serializeRateLimitState } from "./codec";
import type {
	RateLimitStateSnapshot,
	RateLimitStateStore,
	RateLimitStateWrite,
} from "./contract";
import { createMemoryRateLimitStorage } from "./memory";

const policies = [
	["fixed window", fixedWindow({ limit: 3, windowMs: 1_000 })],
	[
		"sliding window counter",
		slidingWindowCounter({ limit: 3, windowMs: 1_000 }),
	],
	[
		"token bucket",
		tokenBucket({ capacity: 3, refillRate: 1, refillIntervalMs: 1_000 }),
	],
	["GCRA", gcra({ limit: 1, windowMs: 1_000, burst: 3 })],
] as const satisfies ReadonlyArray<readonly [string, RateLimitPolicy]>;

describe("memory rate-limit storage", () => {
	it.each(
		policies,
	)("enforces %s through the common contract", async (_, policy) => {
		const storage = createMemoryRateLimitStorage({ clock: () => 0 });

		await expect(
			storage.consume("key", policy, { cost: 2 }),
		).resolves.toMatchObject({
			allowed: true,
			remaining: 1,
		});
		await expect(
			storage.consume("key", policy, { cost: 2 }),
		).resolves.toMatchObject({
			allowed: false,
			remaining: 1,
		});
		await expect(storage.consume("key", policy)).resolves.toMatchObject({
			allowed: true,
			remaining: 0,
		});
	});

	it("serializes concurrent consumption within one process", async () => {
		const storage = createMemoryRateLimitStorage({ clock: () => 0 });
		const policy = fixedWindow({ limit: 10, windowMs: 1_000 });

		const results = await Promise.all(
			Array.from({ length: 20 }, () => storage.consume("key", policy)),
		);

		expect(results.filter((result) => result.allowed)).toHaveLength(10);
	});

	it("starts fresh state when the policy changes", async () => {
		const storage = createMemoryRateLimitStorage({ clock: () => 0 });

		await storage.consume("key", fixedWindow({ limit: 1, windowMs: 1_000 }));
		await expect(
			storage.consume("key", fixedWindow({ limit: 2, windowMs: 1_000 })),
		).resolves.toMatchObject({ allowed: true, remaining: 1 });
	});

	it("discards state at its full-replenishment deadline", async () => {
		let now = 0;
		const storage = createMemoryRateLimitStorage({ clock: () => now });
		const policy = fixedWindow({ limit: 1, windowMs: 100 });

		await storage.consume("key", policy);
		await expect(storage.consume("key", policy)).resolves.toMatchObject({
			allowed: false,
		});
		now = 100;
		await expect(storage.consume("key", policy)).resolves.toMatchObject({
			allowed: true,
		});
	});

	it("evicts the least recently used key at capacity", async () => {
		const storage = createMemoryRateLimitStorage({
			clock: () => 0,
			maxEntries: 2,
		});
		const policy = fixedWindow({ limit: 1, windowMs: 1_000 });

		await storage.consume("first", policy);
		await storage.consume("second", policy);
		await storage.consume("first", policy);
		await storage.consume("third", policy);

		await expect(storage.consume("second", policy)).resolves.toMatchObject({
			allowed: true,
		});
	});
});

describe("CAS rate-limit storage", () => {
	it("re-evaluates against fresh state after a conflict", async () => {
		const policy = fixedWindow({ limit: 2, windowMs: 1_000 });
		let snapshot: RateLimitStateSnapshot<number> | null = null;
		let compareCalls = 0;
		let writtenExpiresAt: number | undefined;
		const store: RateLimitStateStore<number> = {
			async get() {
				return snapshot;
			},
			async compareAndSet(_key, expectedRevision, value) {
				compareCalls++;
				if (compareCalls === 1) {
					const concurrent = evaluateRateLimit(policy, null, 0);
					if (!concurrent.state) {
						throw new Error("Expected persisted state");
					}
					snapshot = { state: concurrent.state, revision: 1 };
					return false;
				}

				if (expectedRevision !== snapshot?.revision) {
					return false;
				}
				writtenExpiresAt = value.expiresAt;
				snapshot = { state: value.state, revision: snapshot.revision + 1 };
				return true;
			},
		};
		const storage = createCasRateLimitStorage(store, { clock: () => 0 });

		await expect(storage.consume("key", policy)).resolves.toMatchObject({
			allowed: true,
			remaining: 0,
		});
		expect(compareCalls).toBe(2);
		expect(writtenExpiresAt).toBe(1_000);
	});

	it("does not persist a request cost that can never fit", async () => {
		let compareCalls = 0;
		const store: RateLimitStateStore<number> = {
			async get() {
				return null;
			},
			async compareAndSet() {
				compareCalls++;
				return true;
			},
		};
		const storage = createCasRateLimitStorage(store, { clock: () => 0 });

		await expect(
			storage.consume("key", fixedWindow({ limit: 1, windowMs: 1_000 }), {
				cost: 2,
			}),
		).resolves.toMatchObject({ allowed: false, retryAfterMs: null });
		expect(compareCalls).toBe(0);
	});

	it("does not write when an active budget denies the request", async () => {
		const policy = fixedWindow({ limit: 1, windowMs: 1_000 });
		const exhausted = evaluateRateLimit(policy, null, 0);
		const state = exhausted.state;
		if (!state) {
			throw new Error("Expected persisted state");
		}
		let compareCalls = 0;
		const store: RateLimitStateStore<number> = {
			async get() {
				return { state, revision: 1 };
			},
			async compareAndSet() {
				compareCalls++;
				return true;
			},
		};
		const storage = createCasRateLimitStorage(store, { clock: () => 0 });

		await expect(storage.consume("key", policy)).resolves.toMatchObject({
			allowed: false,
		});
		expect(compareCalls).toBe(0);
	});

	it("fails after the configured contention bound", async () => {
		const store: RateLimitStateStore<number> = {
			async get() {
				return null;
			},
			async compareAndSet(
				_key: string,
				_expectedRevision: number | null,
				_value: RateLimitStateWrite,
			) {
				return false;
			},
		};
		const storage = createCasRateLimitStorage(store, {
			clock: () => 0,
			maxAttempts: 2,
		});

		await expect(
			storage.consume("key", fixedWindow({ limit: 1, windowMs: 1_000 })),
		).rejects.toThrow('Rate-limit state for key "key" remained contended');
	});
});

describe("persisted rate-limit state", () => {
	it.each(policies)("round-trips %s state", (_name, policy) => {
		const evaluation = evaluateRateLimit(policy, null, 1_000);
		if (!evaluation.state) {
			throw new Error("Expected persisted state");
		}

		expect(
			parseRateLimitState(serializeRateLimitState(evaluation.state)),
		).toEqual(evaluation.state);
	});

	it("rejects unknown serialization versions", () => {
		expect(() =>
			parseRateLimitState(
				JSON.stringify({
					version: 2,
					state: {
						strategy: "fixed-window",
						policyKey: "policy",
						count: 1,
						resetAt: 2_000,
					},
				}),
			),
		).toThrow();
	});

	it("rejects malformed algorithm state", () => {
		expect(() =>
			parseRateLimitState(
				JSON.stringify({
					version: 1,
					state: {
						strategy: "token-bucket",
						policyKey: "policy",
						tokens: -1,
						refilledAt: 1_000,
					},
				}),
			),
		).toThrow();
	});

	it.each([
		["fractional", 1.5],
		["unsafe", Number.MAX_SAFE_INTEGER + 1],
	])("rejects %s integer state", (_name, count) => {
		expect(() =>
			parseRateLimitState(
				JSON.stringify({
					version: 1,
					state: {
						strategy: "fixed-window",
						policyKey: "policy",
						count,
						resetAt: 2_000,
					},
				}),
			),
		).toThrow();
	});
});
