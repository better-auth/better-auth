import { ERROR_CODES } from ".";
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
	const lastRequest = apiKey.lastRequest;
	const rateLimitTimeWindow = apiKey.rateLimitTimeWindow;
	const rateLimitMax = apiKey.rateLimitMax;
	let requestCount = apiKey.requestCount;

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

	if (lastRequest === null) {
		// No previous requests, so allow the first one.
		return {
			success: true,
			message: null,
			update: { lastRequest: now, requestCount: 1 },
			tryAgainIn: null,
		};
	}

	const timeSinceLastRequest = now.getTime() - new Date(lastRequest).getTime();

	if (timeSinceLastRequest > rateLimitTimeWindow) {
		// Time window has passed, reset the request count.
		return {
			success: true,
			message: null,
			update: { lastRequest: now, requestCount: 1 },
			tryAgainIn: null,
		};
	}

	if (requestCount >= rateLimitMax) {
		// Rate limit exceeded.
		return {
			success: false,
			message: ERROR_CODES.RATE_LIMIT_EXCEEDED,
			update: null,
			tryAgainIn: Math.ceil(rateLimitTimeWindow - timeSinceLastRequest),
		};
	}

	// Request is allowed.
	requestCount++;
	return {
		success: true,
		message: null,
		tryAgainIn: null,
		update: { lastRequest: now, requestCount: requestCount },
	};
}
