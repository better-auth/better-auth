import { describe, expect, it } from "vitest";
import { evaluateRateLimit } from "./evaluate";
import type { RateLimitPolicy } from "./policy";
import {
	fixedWindow,
	gcra,
	getRateLimitPolicyKey,
	slidingWindowCounter,
	tokenBucket,
} from "./policy";
import type { RateLimitState } from "./state";

function createConsumer(policy: RateLimitPolicy) {
	let state: RateLimitState | null = null;
	return {
		consume(now: number, cost = 1) {
			const result = evaluateRateLimit(policy, state, now, cost);
			state = result.state;
			return result;
		},
	};
}

describe("fixed window", () => {
	it("anchors the window to the first accepted request", () => {
		const limiter = createConsumer(fixedWindow({ limit: 3, windowMs: 1_000 }));

		expect(limiter.consume(100, 2)).toMatchObject({
			allowed: true,
			remaining: 1,
			resetAt: 1_100,
		});
		expect(limiter.consume(200)).toMatchObject({
			allowed: true,
			remaining: 0,
			resetAt: 1_100,
		});
		expect(limiter.consume(1_099)).toMatchObject({
			allowed: false,
			retryAfterMs: 1,
		});
		expect(limiter.consume(1_100)).toMatchObject({
			allowed: true,
			remaining: 2,
			resetAt: 2_100,
		});
	});

	it("does not create state for a cost that can never fit", () => {
		const result = evaluateRateLimit(
			fixedWindow({ limit: 3, windowMs: 1_000 }),
			null,
			0,
			4,
		);

		expect(result).toMatchObject({
			state: null,
			allowed: false,
			retryAfterMs: null,
			resetAt: 0,
		});
	});
});

describe("sliding window counter", () => {
	it("weights the previous bucket as it slides out", () => {
		const policy = slidingWindowCounter({ limit: 10, windowMs: 1_000 });
		const previousWindow: RateLimitState = {
			strategy: "sliding-window-counter",
			policyKey: getRateLimitPolicyKey(policy),
			currentWindowStartedAt: 0,
			currentCount: 10,
			previousCount: 0,
		};

		const result = evaluateRateLimit(policy, previousWindow, 1_500);

		expect(result).toMatchObject({
			allowed: true,
			remaining: 4,
			state: {
				strategy: "sliding-window-counter",
				currentWindowStartedAt: 1_000,
				currentCount: 1,
				previousCount: 10,
			},
		});
	});

	it("smooths a full bucket across the window boundary", () => {
		const limiter = createConsumer(
			slidingWindowCounter({ limit: 10, windowMs: 1_000 }),
		);

		expect(limiter.consume(900, 10)).toMatchObject({
			allowed: true,
			resetAt: 1_901,
		});
		expect(limiter.consume(1_000)).toMatchObject({
			allowed: false,
			retryAfterMs: 1,
			resetAt: 1_901,
		});
		expect(limiter.consume(1_001)).toMatchObject({
			allowed: true,
			remaining: 0,
		});
	});

	it("includes the full request cost in the admission check", () => {
		const policy = slidingWindowCounter({ limit: 10, windowMs: 1_000 });
		const state: RateLimitState = {
			strategy: "sliding-window-counter",
			policyKey: getRateLimitPolicyKey(policy),
			currentWindowStartedAt: 1_000,
			currentCount: 0,
			previousCount: 10,
		};

		const result = evaluateRateLimit(policy, state, 1_001, 2);

		expect(result).toMatchObject({
			allowed: false,
			remaining: 1,
			retryAfterMs: 100,
		});
		expect(result.state).toEqual(state);
	});

	it("forgets both buckets after two complete windows", () => {
		const policy = slidingWindowCounter({ limit: 10, windowMs: 1_000 });
		const state: RateLimitState = {
			strategy: "sliding-window-counter",
			policyKey: getRateLimitPolicyKey(policy),
			currentWindowStartedAt: 0,
			currentCount: 10,
			previousCount: 7,
		};

		const result = evaluateRateLimit(policy, state, 2_000);

		expect(result).toMatchObject({
			allowed: true,
			remaining: 9,
			state: {
				currentWindowStartedAt: 2_000,
				currentCount: 1,
				previousCount: 0,
			},
		});
	});

	it("reports the earliest retry across the complete two-bucket state space", () => {
		const policy = slidingWindowCounter({ limit: 5, windowMs: 20 });
		const policyKey = getRateLimitPolicyKey(policy);

		for (
			let previousCount = 0;
			previousCount <= policy.limit;
			previousCount++
		) {
			for (let currentCount = 0; currentCount <= policy.limit; currentCount++) {
				for (let now = 0; now < policy.windowMs; now++) {
					for (let cost = 1; cost <= policy.limit; cost++) {
						const state: RateLimitState = {
							strategy: "sliding-window-counter",
							policyKey,
							currentWindowStartedAt: 0,
							currentCount,
							previousCount,
						};
						const denied = evaluateRateLimit(policy, state, now, cost);
						if (denied.allowed || denied.retryAfterMs === null) {
							continue;
						}

						let earliestRetry: number | undefined;
						for (let delay = 1; delay <= policy.windowMs * 2; delay++) {
							if (evaluateRateLimit(policy, state, now + delay, cost).allowed) {
								earliestRetry = delay;
								break;
							}
						}

						expect(denied.retryAfterMs).toBe(earliestRetry);
					}
				}
			}
		}
	});
});

describe("token bucket", () => {
	it("refills continuously up to its capacity", () => {
		const limiter = createConsumer(
			tokenBucket({ capacity: 5, refillRate: 2, refillIntervalMs: 1_000 }),
		);

		expect(limiter.consume(0, 5)).toMatchObject({
			allowed: true,
			remaining: 0,
			resetAt: 2_500,
		});
		expect(limiter.consume(250)).toMatchObject({
			allowed: false,
			retryAfterMs: 250,
			resetAt: 2_500,
		});
		expect(limiter.consume(500)).toMatchObject({
			allowed: true,
			remaining: 0,
			resetAt: 3_000,
		});
		expect(limiter.consume(3_000, 5)).toMatchObject({
			allowed: true,
			remaining: 0,
		});
	});

	it("does not mint tokens when the clock moves backwards", () => {
		const policy = tokenBucket({
			capacity: 5,
			refillRate: 2,
			refillIntervalMs: 1_000,
		});
		const state: RateLimitState = {
			strategy: "token-bucket",
			policyKey: getRateLimitPolicyKey(policy),
			tokens: 0,
			refilledAt: 1_000,
		};

		const result = evaluateRateLimit(policy, state, 500);

		expect(result).toMatchObject({
			allowed: false,
			retryAfterMs: 1_000,
			state: { tokens: 0, refilledAt: 1_000 },
		});
	});

	it("rejects a cost larger than capacity without a retry time", () => {
		const result = evaluateRateLimit(
			tokenBucket({ capacity: 5, refillRate: 1, refillIntervalMs: 1_000 }),
			null,
			0,
			6,
		);

		expect(result).toMatchObject({
			allowed: false,
			remaining: 5,
			retryAfterMs: null,
		});
	});
});

describe("GCRA", () => {
	it("tracks a burst with one theoretical-arrival timestamp", () => {
		const limiter = createConsumer(
			gcra({ limit: 1, windowMs: 1_000, burst: 3 }),
		);

		expect(limiter.consume(0, 3)).toMatchObject({
			allowed: true,
			remaining: 0,
			resetAt: 3_000,
			state: { theoreticalArrivalTime: 3_000 },
		});
		expect(limiter.consume(0)).toMatchObject({
			allowed: false,
			retryAfterMs: 1_000,
			state: { theoreticalArrivalTime: 3_000 },
		});
		expect(limiter.consume(1_000)).toMatchObject({
			allowed: true,
			remaining: 0,
			state: { theoreticalArrivalTime: 4_000 },
		});
	});

	it("restores burst capacity at the configured emission rate", () => {
		const policy = gcra({ limit: 1, windowMs: 1_000, burst: 3 });
		const state: RateLimitState = {
			strategy: "gcra",
			policyKey: getRateLimitPolicyKey(policy),
			theoreticalArrivalTime: 3_000,
		};

		expect(evaluateRateLimit(policy, state, 2_000, 2)).toMatchObject({
			allowed: true,
			remaining: 0,
		});
		expect(evaluateRateLimit(policy, state, 2_000, 3)).toMatchObject({
			allowed: false,
			retryAfterMs: 1_000,
		});
	});

	it("rejects a cost larger than burst capacity without a retry time", () => {
		const result = evaluateRateLimit(
			gcra({ limit: 1, windowMs: 1_000, burst: 3 }),
			null,
			0,
			4,
		);

		expect(result).toMatchObject({
			state: null,
			allowed: false,
			retryAfterMs: null,
		});
	});
});

describe("policy boundary", () => {
	it.each([
		fixedWindow({ limit: 3, windowMs: 1_000 }),
		slidingWindowCounter({ limit: 3, windowMs: 1_000 }),
		tokenBucket({ capacity: 3, refillRate: 1, refillIntervalMs: 1_000 }),
		gcra({ limit: 3, windowMs: 1_000, burst: 3 }),
	])("uses one result contract for $strategy", (policy) => {
		const result = evaluateRateLimit(policy, null, 0, 2);

		expect(result).toMatchObject({
			allowed: true,
			remaining: 1,
			retryAfterMs: null,
		});
		expect(Number.isSafeInteger(result.resetAt)).toBe(true);
	});

	it.each([
		{
			name: "fixed window",
			previous: fixedWindow({ limit: 1, windowMs: 1_000 }),
			next: fixedWindow({ limit: 1, windowMs: 2_000 }),
		},
		{
			name: "sliding window counter",
			previous: slidingWindowCounter({ limit: 1, windowMs: 1_000 }),
			next: slidingWindowCounter({ limit: 1, windowMs: 2_000 }),
		},
		{
			name: "token bucket",
			previous: tokenBucket({
				capacity: 1,
				refillRate: 1,
				refillIntervalMs: 1_000,
			}),
			next: tokenBucket({
				capacity: 1,
				refillRate: 2,
				refillIntervalMs: 1_000,
			}),
		},
		{
			name: "GCRA",
			previous: gcra({ limit: 1, windowMs: 1_000, burst: 1 }),
			next: gcra({ limit: 2, windowMs: 1_000, burst: 1 }),
		},
	])("starts fresh when the $name policy changes", ({ previous, next }) => {
		const exhausted = evaluateRateLimit(previous, null, 0);
		const result = evaluateRateLimit(next, exhausted.state, 0);

		expect(result).toMatchObject({
			allowed: true,
			state: { policyKey: getRateLimitPolicyKey(next) },
		});
	});

	it("starts fresh when the strategy changes", () => {
		const fixed = evaluateRateLimit(
			fixedWindow({ limit: 1, windowMs: 1_000 }),
			null,
			0,
		);
		const token = evaluateRateLimit(
			tokenBucket({ capacity: 2, refillRate: 1, refillIntervalMs: 1_000 }),
			fixed.state,
			0,
		);

		expect(token).toMatchObject({
			allowed: true,
			remaining: 1,
			state: { strategy: "token-bucket", tokens: 1 },
		});
	});

	it("starts fresh when persisted state predates policy keys", () => {
		const legacyState = {
			strategy: "fixed-window",
			count: 1,
			resetAt: 1_000,
		} as unknown as RateLimitState;

		const result = evaluateRateLimit(
			fixedWindow({ limit: 1, windowMs: 1_000 }),
			legacyState,
			0,
		);

		expect(result).toMatchObject({ allowed: true, remaining: 0 });
	});

	it.each([
		["zero limit", () => fixedWindow({ limit: 0, windowMs: 1_000 })],
		[
			"fractional limit",
			() => slidingWindowCounter({ limit: 1.5, windowMs: 1_000 }),
		],
		[
			"zero refill rate",
			() =>
				tokenBucket({
					capacity: 1,
					refillRate: 0,
					refillIntervalMs: 1_000,
				}),
		],
		["zero burst", () => gcra({ limit: 1, windowMs: 1_000, burst: 0 })],
	])("rejects an invalid %s", (_name, createPolicy) => {
		expect(createPolicy).toThrow(RangeError);
	});

	it("rejects invalid costs and timestamps", () => {
		const policy = fixedWindow({ limit: 1, windowMs: 1_000 });

		expect(() => evaluateRateLimit(policy, null, 0, 0)).toThrow(RangeError);
		expect(() => evaluateRateLimit(policy, null, Number.NaN)).toThrow(
			RangeError,
		);
	});
});
