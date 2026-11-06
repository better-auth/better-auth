import { assertPositiveInteger, assertPositiveNumber } from "./validation";

export type FixedWindowRateLimitPolicy = {
	strategy: "fixed-window";
	limit: number;
	windowMs: number;
};

export type SlidingWindowCounterRateLimitPolicy = {
	strategy: "sliding-window-counter";
	limit: number;
	windowMs: number;
};

export type TokenBucketRateLimitPolicy = {
	strategy: "token-bucket";
	capacity: number;
	refillRate: number;
	refillIntervalMs: number;
};

export type GcraRateLimitPolicy = {
	strategy: "gcra";
	limit: number;
	windowMs: number;
	burst: number;
};

/** Rate-limit strategies supported by the policy engine. */
export type RateLimitPolicy =
	| FixedWindowRateLimitPolicy
	| SlidingWindowCounterRateLimitPolicy
	| TokenBucketRateLimitPolicy
	| GcraRateLimitPolicy;

/**
 * Creates a first-request-anchored fixed-window policy.
 */
export function fixedWindow({
	limit,
	windowMs,
}: Omit<FixedWindowRateLimitPolicy, "strategy">): FixedWindowRateLimitPolicy {
	assertPositiveInteger("limit", limit);
	assertPositiveInteger("windowMs", windowMs);
	return { strategy: "fixed-window", limit, windowMs };
}

/**
 * Creates an epoch-aligned, two-bucket sliding-window-counter policy.
 */
export function slidingWindowCounter({
	limit,
	windowMs,
}: Omit<
	SlidingWindowCounterRateLimitPolicy,
	"strategy"
>): SlidingWindowCounterRateLimitPolicy {
	assertPositiveInteger("limit", limit);
	assertPositiveInteger("windowMs", windowMs);
	return { strategy: "sliding-window-counter", limit, windowMs };
}

/**
 * Creates a continuously refilled token-bucket policy.
 */
export function tokenBucket({
	capacity,
	refillRate,
	refillIntervalMs,
}: Omit<TokenBucketRateLimitPolicy, "strategy">): TokenBucketRateLimitPolicy {
	assertPositiveInteger("capacity", capacity);
	assertPositiveNumber("refillRate", refillRate);
	assertPositiveInteger("refillIntervalMs", refillIntervalMs);
	return {
		strategy: "token-bucket",
		capacity,
		refillRate,
		refillIntervalMs,
	};
}

/**
 * Creates a GCRA policy with an optional immediate burst capacity.
 */
export function gcra({
	limit,
	windowMs,
	burst = limit,
}: Omit<GcraRateLimitPolicy, "strategy" | "burst"> & {
	burst?: number;
}): GcraRateLimitPolicy {
	assertPositiveInteger("limit", limit);
	assertPositiveInteger("windowMs", windowMs);
	assertPositiveInteger("burst", burst);
	return { strategy: "gcra", limit, windowMs, burst };
}

export function getRateLimitPolicyKey(policy: RateLimitPolicy): string {
	switch (policy.strategy) {
		case "fixed-window":
		case "sliding-window-counter":
			return `v1:${policy.strategy}:${policy.limit}:${policy.windowMs}`;
		case "token-bucket":
			return `v1:${policy.strategy}:${policy.capacity}:${policy.refillRate}:${policy.refillIntervalMs}`;
		case "gcra":
			return `v1:${policy.strategy}:${policy.limit}:${policy.windowMs}:${policy.burst}`;
	}
}
