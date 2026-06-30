/**
 * Ping and push token delivery (CIBA §10.2/§10.3). In ping mode the AS notifies
 * the client that the request is ready and the client polls for tokens; in push
 * mode the AS delivers the full token set to the client notification endpoint.
 * Delivery is best-effort with bounded exponential-backoff retry; on exhaustion
 * the request is already consumed, so the client must re-initiate or, for ping,
 * the notification simply never arrives.
 */

const FETCH_TIMEOUT_MS = 10_000;

async function fetchWithRetry(
	url: string,
	init: RequestInit,
	maxRetries: number,
): Promise<void> {
	let lastError: Error | undefined;
	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			const res = await fetch(url, {
				...init,
				signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
			});
			if (res.ok) {
				return;
			}
			lastError = new Error(`HTTP ${res.status}`);
		} catch (err) {
			lastError = err as Error;
		}
		if (attempt < maxRetries) {
			// Exponential backoff: 1s, 2s, 4s, ...
			await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
		}
	}
	throw lastError ?? new Error("Notification delivery failed");
}

/** Push mode: deliver the full token response to the client endpoint. */
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
				authorization: `Bearer ${notificationToken}`,
				"content-type": "application/json",
			},
			body: JSON.stringify(payload),
		},
		maxRetries,
	);
}

/** Ping mode: notify the client that the request is ready to be polled. */
export async function deliverPing(
	endpoint: string,
	notificationToken: string,
	authReqId: string,
	maxRetries: number,
): Promise<void> {
	await fetchWithRetry(
		endpoint,
		{
			method: "POST",
			headers: {
				authorization: `Bearer ${notificationToken}`,
				"content-type": "application/json",
			},
			body: JSON.stringify({ auth_req_id: authReqId }),
		},
		maxRetries,
	);
}

/** Push mode: notify the client that the user denied the request. */
export async function deliverError(
	endpoint: string,
	notificationToken: string,
	authReqId: string,
	error: string,
	errorDescription: string,
	maxRetries: number,
): Promise<void> {
	await fetchWithRetry(
		endpoint,
		{
			method: "POST",
			headers: {
				authorization: `Bearer ${notificationToken}`,
				"content-type": "application/json",
			},
			body: JSON.stringify({
				auth_req_id: authReqId,
				error,
				error_description: errorDescription,
			}),
		},
		maxRetries,
	);
}
