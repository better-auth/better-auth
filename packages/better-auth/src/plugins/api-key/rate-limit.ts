import type { ApiKey } from "./types";

interface RateLimitResult {
	success: boolean;
	message: string | null;
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
): RateLimitResult {
	const now = new Date();
	const lastRequest = apiKey.lastRequest;
	const rateLimitTimeWindow = apiKey.rateLimitTimeWindow;
	const rateLimitMax = apiKey.rateLimitMax;
	let requestCount = apiKey.requestCount;

    if(rateLimitTimeWindow === null || rateLimitMax === null){
        // Rate limiting is disabled.
        return {
            success: true,
            message: null,
            update: null,
        }
    }

	if (lastRequest === null) {
		// No previous requests, so allow the first one.
		return {
			success: true,
			message: null,
			update: { lastRequest: now, requestCount: 1 },
		};
	}

	const timeSinceLastRequest = (now.getTime() - lastRequest.getTime()) / 1000; // in seconds

	if (timeSinceLastRequest > rateLimitTimeWindow) {
		// Time window has passed, reset the request count.
		return {
			success: true,
			message: null,
			update: { lastRequest: now, requestCount: 1 },
		};
	}

	if (requestCount >= rateLimitMax) {
		// Rate limit exceeded.
		return {
			success: false,
			message: `Rate limit exceeded. Try again in ${Math.ceil(
				rateLimitTimeWindow - timeSinceLastRequest,
			)} seconds.`,
			update: null,
		};
	}

	// Request is allowed.
	requestCount++;
	return {
		success: true,
		message: null,
		update: { lastRequest: now, requestCount: requestCount },
	};
}
