import { API_KEY_ERROR_CODES as ERROR_CODES } from ".";
import type { PredefinedApiKeyOptions } from "./routes";
import type { ApiKey } from "./types";

interface RateLimitResult {
	success: boolean;
	message: string | null;
	tryAgainIn: number | null;
	update: Partial<ApiKey> | null;
}

/**
 * Determines if a request is allowed based on rate limiting parameters.
 *
 * Uses a **fixed window**: at most `rateLimitMax` successful validations within
 * each `[windowStart, windowStart + rateLimitTimeWindow)` interval. The window
 * start does not move on each request (unlike a purely last-activity-based rule).
 *
 * @returns An object indicating whether the request is allowed and, if not,
 *          a message and updated ApiKey data.
 */
export function isRateLimited(
	/**
	 * The ApiKey object containing rate limiting information
	 */
	apiKey: ApiKey,
	opts: PredefinedApiKeyOptions,
): RateLimitResult {
	const now = new Date();
	const nowMs = now.getTime();
	const rateLimitTimeWindow = apiKey.rateLimitTimeWindow;
	const rateLimitMax = apiKey.rateLimitMax;
	let requestCount = apiKey.requestCount;
	const rateLimitWindowStart = apiKey.rateLimitWindowStart;

	if (opts.rateLimit.enabled === false)
		return {
			success: true,
			message: null,
			update: { lastRequest: now },
			tryAgainIn: null,
		};

	if (apiKey.rateLimitEnabled === false)
		return {
			success: true,
			message: null,
			update: { lastRequest: now },
			tryAgainIn: null,
		};

	if (rateLimitTimeWindow === null || rateLimitMax === null) {
		// Rate limiting is disabled.
		return {
			success: true,
			message: null,
			update: null,
			tryAgainIn: null,
		};
	}

	// No window yet (new key, or counters reset after config change / migration).
	if (rateLimitWindowStart == null) {
		return {
			success: true,
			message: null,
			update: {
				rateLimitWindowStart: now,
				requestCount: 1,
				lastRequest: now,
			},
			tryAgainIn: null,
		};
	}

	const windowStartMs = new Date(rateLimitWindowStart).getTime();
	const elapsed = nowMs - windowStartMs;

	if (elapsed >= rateLimitTimeWindow) {
		// New window: full quota again until the next boundary.
		return {
			success: true,
			message: null,
			update: {
				rateLimitWindowStart: now,
				requestCount: 1,
				lastRequest: now,
			},
			tryAgainIn: null,
		};
	}

	if (requestCount >= rateLimitMax) {
		const windowEndMs = windowStartMs + rateLimitTimeWindow;
		return {
			success: false,
			message: ERROR_CODES.RATE_LIMIT_EXCEEDED.message,
			update: null,
			tryAgainIn: Math.max(0, Math.ceil(windowEndMs - nowMs)),
		};
	}

	requestCount++;
	return {
		success: true,
		message: null,
		tryAgainIn: null,
		update: {
			lastRequest: now,
			requestCount: requestCount,
		},
	};
}
