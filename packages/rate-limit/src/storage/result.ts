import type { RateLimitEvaluation, RateLimitResult } from "../state";

export function toRateLimitResult(
	evaluation: RateLimitEvaluation,
): RateLimitResult {
	return {
		allowed: evaluation.allowed,
		remaining: evaluation.remaining,
		retryAfterMs: evaluation.retryAfterMs,
		resetAt: evaluation.resetAt,
	};
}
