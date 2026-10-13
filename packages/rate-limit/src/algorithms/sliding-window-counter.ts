import type { SlidingWindowCounterRateLimitPolicy } from "../policy";
import { getRateLimitPolicyKey } from "../policy";
import type {
	RateLimitEvaluation,
	RateLimitState,
	SlidingWindowCounterRateLimitState,
} from "../state";

export function evaluateSlidingWindowCounter(
	policy: SlidingWindowCounterRateLimitPolicy,
	state: RateLimitState | null,
	now: number,
	cost: number,
): RateLimitEvaluation {
	const current = normalizeSlidingWindowState(policy, state, now);
	const used = getSlidingWindowUsage(policy, current, now);
	const resetAt = getSlidingWindowResetAt(policy, current, now);

	if (cost > policy.limit) {
		return {
			state: current,
			allowed: false,
			remaining: Math.max(0, policy.limit - used),
			retryAfterMs: null,
			resetAt,
		};
	}

	if (used + cost > policy.limit) {
		return {
			state: current,
			allowed: false,
			remaining: Math.max(0, policy.limit - used),
			retryAfterMs: getSlidingWindowRetryAfter(policy, current, now, cost),
			resetAt,
		};
	}

	const next: SlidingWindowCounterRateLimitState = {
		...current,
		currentCount: current.currentCount + cost,
	};
	return {
		state: next,
		allowed: true,
		remaining: policy.limit - used - cost,
		retryAfterMs: null,
		resetAt: getSlidingWindowResetAt(policy, next, now),
	};
}

function getSlidingWindowResetAt(
	policy: SlidingWindowCounterRateLimitPolicy,
	state: SlidingWindowCounterRateLimitState,
	now: number,
): number {
	if (state.currentCount > 0) {
		const nextWindowStartedAt = state.currentWindowStartedAt + policy.windowMs;
		return (
			getAvailabilityInWindow(
				policy,
				nextWindowStartedAt,
				state.currentCount,
				0,
				policy.limit,
			) ?? nextWindowStartedAt
		);
	}
	const availableAt = getAvailabilityInWindow(
		policy,
		state.currentWindowStartedAt,
		state.previousCount,
		0,
		policy.limit,
	);
	return Math.max(now, availableAt ?? now);
}

function normalizeSlidingWindowState(
	policy: SlidingWindowCounterRateLimitPolicy,
	state: RateLimitState | null,
	now: number,
): SlidingWindowCounterRateLimitState {
	const policyKey = getRateLimitPolicyKey(policy);
	const current =
		state?.strategy === policy.strategy && state.policyKey === policyKey
			? state
			: null;
	if (!current) {
		return {
			strategy: "sliding-window-counter",
			policyKey,
			currentWindowStartedAt: getWindowStart(now, policy.windowMs),
			currentCount: 0,
			previousCount: 0,
		};
	}

	const effectiveNow = Math.max(now, current.currentWindowStartedAt);
	const windowStartedAt = getWindowStart(effectiveNow, policy.windowMs);
	const windowsElapsed = Math.floor(
		(windowStartedAt - current.currentWindowStartedAt) / policy.windowMs,
	);
	if (windowsElapsed <= 0) {
		return current;
	}
	if (windowsElapsed === 1) {
		return {
			...current,
			currentWindowStartedAt: windowStartedAt,
			currentCount: 0,
			previousCount: current.currentCount,
		};
	}
	return {
		...current,
		currentWindowStartedAt: windowStartedAt,
		currentCount: 0,
		previousCount: 0,
	};
}

function getSlidingWindowUsage(
	policy: SlidingWindowCounterRateLimitPolicy,
	state: SlidingWindowCounterRateLimitState,
	now: number,
): number {
	const elapsed = Math.min(
		policy.windowMs,
		Math.max(0, now - state.currentWindowStartedAt),
	);
	const weightedPrevious = Math.floor(
		(state.previousCount * (policy.windowMs - elapsed)) / policy.windowMs,
	);
	return weightedPrevious + state.currentCount;
}

function getSlidingWindowRetryAfter(
	policy: SlidingWindowCounterRateLimitPolicy,
	state: SlidingWindowCounterRateLimitState,
	now: number,
	cost: number,
): number {
	const availableAt = getAvailabilityInWindow(
		policy,
		state.currentWindowStartedAt,
		state.previousCount,
		state.currentCount,
		cost,
	);
	if (availableAt !== null && availableAt > now) {
		return Math.ceil(availableAt - now);
	}

	const nextWindowStartedAt = state.currentWindowStartedAt + policy.windowMs;
	const nextAvailableAt = getAvailabilityInWindow(
		policy,
		nextWindowStartedAt,
		state.currentCount,
		0,
		cost,
	);
	return Math.max(1, Math.ceil((nextAvailableAt ?? nextWindowStartedAt) - now));
}

function getAvailabilityInWindow(
	policy: SlidingWindowCounterRateLimitPolicy,
	windowStartedAt: number,
	previousCount: number,
	currentCount: number,
	cost: number,
): number | null {
	if (currentCount + cost > policy.limit) {
		return null;
	}
	if (previousCount + currentCount + cost <= policy.limit) {
		return windowStartedAt;
	}

	const maximumPreviousCount = policy.limit - currentCount - cost;
	const decayBoundary =
		policy.windowMs -
		((maximumPreviousCount + 1) * policy.windowMs) / previousCount;
	return windowStartedAt + Math.floor(decayBoundary) + 1;
}

function getWindowStart(now: number, windowMs: number): number {
	return Math.floor(now / windowMs) * windowMs;
}
