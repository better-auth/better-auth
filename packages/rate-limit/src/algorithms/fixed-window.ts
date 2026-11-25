import type { FixedWindowRateLimitPolicy } from "../policy";
import { getRateLimitPolicyKey } from "../policy";
import type {
	FixedWindowRateLimitState,
	RateLimitEvaluation,
	RateLimitState,
} from "../state";

export function evaluateFixedWindow(
	policy: FixedWindowRateLimitPolicy,
	state: RateLimitState | null,
	now: number,
	cost: number,
): RateLimitEvaluation {
	const policyKey = getRateLimitPolicyKey(policy);
	const current =
		state?.strategy === policy.strategy && state.policyKey === policyKey
			? state
			: null;
	const active = current && now < current.resetAt ? current : null;
	const resetAt = active?.resetAt ?? now + policy.windowMs;

	if (cost > policy.limit) {
		return {
			state: active,
			allowed: false,
			remaining: Math.max(0, policy.limit - (active?.count ?? 0)),
			retryAfterMs: null,
			resetAt: active?.resetAt ?? now,
		};
	}

	const count = active?.count ?? 0;
	if (count + cost > policy.limit) {
		return {
			state: active,
			allowed: false,
			remaining: policy.limit - count,
			retryAfterMs: Math.max(0, Math.ceil(resetAt - now)),
			resetAt,
		};
	}

	const next: FixedWindowRateLimitState = {
		strategy: "fixed-window",
		policyKey,
		count: count + cost,
		resetAt,
	};
	return {
		state: next,
		allowed: true,
		remaining: policy.limit - next.count,
		retryAfterMs: null,
		resetAt,
	};
}
