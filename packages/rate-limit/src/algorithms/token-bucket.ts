import type { TokenBucketRateLimitPolicy } from "../policy";
import { getRateLimitPolicyKey } from "../policy";
import type {
	RateLimitEvaluation,
	RateLimitState,
	TokenBucketRateLimitState,
} from "../state";

export function evaluateTokenBucket(
	policy: TokenBucketRateLimitPolicy,
	state: RateLimitState | null,
	now: number,
	cost: number,
): RateLimitEvaluation {
	const current = refillTokenBucket(policy, state, now);
	const allowed =
		cost <= policy.capacity && current.tokens + Number.EPSILON >= cost;
	const tokens = allowed ? Math.max(0, current.tokens - cost) : current.tokens;
	const next: TokenBucketRateLimitState = { ...current, tokens };
	const millisecondsPerToken = policy.refillIntervalMs / policy.refillRate;
	const resetAt =
		current.refilledAt +
		Math.ceil((policy.capacity - tokens) * millisecondsPerToken);

	return {
		state: next,
		allowed,
		remaining: Math.max(0, Math.floor(tokens)),
		retryAfterMs:
			allowed || cost > policy.capacity
				? null
				: Math.max(
						1,
						Math.ceil(
							current.refilledAt +
								(cost - current.tokens) * millisecondsPerToken -
								now,
						),
					),
		resetAt,
	};
}

function refillTokenBucket(
	policy: TokenBucketRateLimitPolicy,
	state: RateLimitState | null,
	now: number,
): TokenBucketRateLimitState {
	const policyKey = getRateLimitPolicyKey(policy);
	const current =
		state?.strategy === policy.strategy && state.policyKey === policyKey
			? state
			: null;
	if (!current) {
		return {
			strategy: "token-bucket",
			policyKey,
			tokens: policy.capacity,
			refilledAt: now,
		};
	}

	const refilledAt = Math.max(now, current.refilledAt);
	const elapsed = refilledAt - current.refilledAt;
	const tokens = Math.min(
		policy.capacity,
		current.tokens + (elapsed / policy.refillIntervalMs) * policy.refillRate,
	);
	return { ...current, tokens, refilledAt };
}
