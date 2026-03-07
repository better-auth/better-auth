/**
 * Push/ping delivery with exponential backoff retry.
 *
 * On exhaustion: request stays approved, allowing polling fallback.
 */

async function fetchWithRetry(
	url: string,
	init: RequestInit,
	maxRetries: number,
): Promise<Response> {
	let lastError: Error | undefined;
	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			const res = await fetch(url, init);
			if (res.ok) return res;
			lastError = new Error(`HTTP ${res.status}`);
		} catch (err) {
			lastError = err as Error;
		}
		if (attempt < maxRetries) {
			// Exponential backoff: 1s, 2s, 4s
			await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
		}
	}
	throw lastError;
}

/**
 * Push mode: deliver full token response to the client's notification endpoint.
 */
export async function deliverPush(
	endpoint: string,
	notificationToken: string,
	payload: Record<string, unknown>,
	maxRetries: number,
): Promise<void> {
	await fetchWithRetry(
		endpoint,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${notificationToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(payload),
		},
		maxRetries,
	);
}

/**
 * Ping mode: notify client that the request is ready for polling.
 */
export async function deliverPing(
	endpoint: string,
	notificationToken: string,
	authReqId: string,
): Promise<void> {
	await fetchWithRetry(
		endpoint,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${notificationToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ auth_req_id: authReqId }),
		},
		2, // Fewer retries for ping since client can still poll
	);
}

/**
 * Push mode error delivery: notify client of rejection.
 */
export async function deliverError(
	endpoint: string,
	notificationToken: string,
	authReqId: string,
	error: string,
	errorDescription: string,
): Promise<void> {
	await fetchWithRetry(
		endpoint,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${notificationToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				auth_req_id: authReqId,
				error,
				error_description: errorDescription,
			}),
		},
		1, // Minimal retries for error delivery
	);
}
