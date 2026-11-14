import type { GcraRateLimitPolicy } from "../policy";
import { getRateLimitPolicyKey } from "../policy";
import type {
	GcraRateLimitState,
	RateLimitEvaluation,
	RateLimitState,
} from "../state";

export function evaluateGcra(
	policy: GcraRateLimitPolicy,
	state: RateLimitState | null,
	now: number,
	cost: number,
): RateLimitEvaluation {
	const policyKey = getRateLimitPolicyKey(policy);
	const current =
		state?.strategy === policy.strategy && state.policyKey === policyKey
			? state
			: null;
	const theoreticalArrivalTime = current?.theoreticalArrivalTime ?? now;
	const emissionInterval = policy.windowMs / policy.limit;
	const delayVariationTolerance = emissionInterval * policy.burst;
	const nextTheoreticalArrivalTime =
		Math.max(theoreticalArrivalTime, now) + emissionInterval * cost;
	const allowAt = nextTheoreticalArrivalTime - delayVariationTolerance;
	const allowed = cost <= policy.burst && now >= allowAt;

	if (!allowed) {
		return {
			state: current,
			allowed: false,
			remaining: getGcraRemaining(policy, theoreticalArrivalTime, now),
			retryAfterMs:
				cost > policy.burst ? null : Math.max(1, Math.ceil(allowAt - now)),
			resetAt: Math.max(now, Math.ceil(theoreticalArrivalTime)),
		};
	}

	const next: GcraRateLimitState = {
		strategy: "gcra",
		policyKey,
		theoreticalArrivalTime: nextTheoreticalArrivalTime,
	};
	return {
		state: next,
		allowed: true,
		remaining: getGcraRemaining(policy, nextTheoreticalArrivalTime, now),
		retryAfterMs: null,
		resetAt: Math.ceil(nextTheoreticalArrivalTime),
	};
}

function getGcraRemaining(
	policy: GcraRateLimitPolicy,
	theoreticalArrivalTime: number,
	now: number,
): number {
	const emissionInterval = policy.windowMs / policy.limit;
	const occupied = Math.max(0, theoreticalArrivalTime - now);
	return Math.max(
		0,
		Math.min(
			policy.burst,
			Math.floor(policy.burst - occupied / emissionInterval + 1e-9),
		),
	);
}
