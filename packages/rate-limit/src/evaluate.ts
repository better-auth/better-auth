import { evaluateFixedWindow } from "./algorithms/fixed-window";
import { evaluateGcra } from "./algorithms/gcra";
import { evaluateSlidingWindowCounter } from "./algorithms/sliding-window-counter";
import { evaluateTokenBucket } from "./algorithms/token-bucket";
import type { RateLimitPolicy } from "./policy";
import type { RateLimitEvaluation, RateLimitState } from "./state";
import { assertRateLimitCost, assertRateLimitPolicy } from "./validation";

/**
 * Evaluates one atomic rate-limit state transition.
 *
 * Callers must persist the returned state with the same atomic operation used
 * to read the input state, or retry the transition after a compare-and-swap
 * conflict.
 */
export function evaluateRateLimit(
	policy: RateLimitPolicy,
	state: RateLimitState | null,
	now: number,
	cost = 1,
): RateLimitEvaluation {
	assertRateLimitPolicy(policy);
	assertRateLimitCost(cost);
	if (!Number.isSafeInteger(now)) {
		throw new RangeError("now must be a safe integer timestamp");
	}

	switch (policy.strategy) {
		case "fixed-window":
			return evaluateFixedWindow(policy, state, now, cost);
		case "sliding-window-counter":
			return evaluateSlidingWindowCounter(policy, state, now, cost);
		case "token-bucket":
			return evaluateTokenBucket(policy, state, now, cost);
		case "gcra":
			return evaluateGcra(policy, state, now, cost);
	}
}
