type RateLimitStateMetadata = {
	policyKey: string;
};

export type FixedWindowRateLimitState = RateLimitStateMetadata & {
	strategy: "fixed-window";
	count: number;
	resetAt: number;
};

export type SlidingWindowCounterRateLimitState = RateLimitStateMetadata & {
	strategy: "sliding-window-counter";
	currentWindowStartedAt: number;
	currentCount: number;
	previousCount: number;
};

export type TokenBucketRateLimitState = RateLimitStateMetadata & {
	strategy: "token-bucket";
	tokens: number;
	refilledAt: number;
};

export type GcraRateLimitState = RateLimitStateMetadata & {
	strategy: "gcra";
	theoreticalArrivalTime: number;
};

export type RateLimitState =
	| FixedWindowRateLimitState
	| SlidingWindowCounterRateLimitState
	| TokenBucketRateLimitState
	| GcraRateLimitState;

export type RateLimitResult = {
	allowed: boolean;
	/**
	 * Whole units that can still be consumed immediately.
	 */
	remaining: number;
	retryAfterMs: number | null;
	/**
	 * Time at which the state represented by this result is fully replenished.
	 */
	resetAt: number;
};

export type RateLimitEvaluation = RateLimitResult & {
	state: RateLimitState | null;
};
