/**
 * `ENOTFOUND` is deliberately absent: a name that does not resolve is not
 * transient.
 *
 * @see https://nodejs.org/api/errors.html#common-system-errors
 */
const TRANSIENT_NETWORK_ERROR_CODES = new Set([
	"EAI_AGAIN",
	"ECONNRESET",
	"ECONNREFUSED",
	"ETIMEDOUT",
	"EHOSTUNREACH",
	"ENETUNREACH",
	"EPIPE",
	"UND_ERR_CONNECT_TIMEOUT",
	"UND_ERR_HEADERS_TIMEOUT",
	"UND_ERR_BODY_TIMEOUT",
	"UND_ERR_SOCKET",
]);

/** @see https://www.rfc-editor.org/rfc/rfc5861#section-4 */
const TRANSIENT_HTTP_STATUSES = new Set([500, 502, 503, 504]);

// Local capacity refusals say nothing about the host.
const LOCAL_CAPACITY_ERROR_CODES = new Set(["ERR_CIMD_DNS_LOOKUP_LIMIT"]);
const REQUEST_ABORTED_CODE = "ERR_CIMD_REQUEST_ABORTED";

function someErrorInCauseChain(
	error: unknown,
	predicate: (candidate: object) => boolean,
): boolean {
	const seen = new Set<unknown>();
	let candidate = error;
	while (
		typeof candidate === "object" &&
		candidate !== null &&
		!seen.has(candidate)
	) {
		seen.add(candidate);
		if (predicate(candidate)) return true;
		candidate = (candidate as { cause?: unknown }).cause;
	}
	return false;
}

export function isTransientNetworkError(error: unknown): boolean {
	return someErrorInCauseChain(error, (candidate) => {
		const code = (candidate as { code?: unknown }).code;
		return typeof code === "string" && TRANSIENT_NETWORK_ERROR_CODES.has(code);
	});
}

export function isLocalCapacityRefusal(error: unknown): boolean {
	return someErrorInCauseChain(error, (candidate) => {
		const code = (candidate as { code?: unknown }).code;
		return typeof code === "string" && LOCAL_CAPACITY_ERROR_CODES.has(code);
	});
}

export function isTransientHttpStatus(status: number): boolean {
	return TRANSIENT_HTTP_STATUSES.has(status);
}

/**
 * Whether aborting `signal` ended a request the transport had already sent to
 * the host, which it reports with the code `ERR_CIMD_REQUEST_ABORTED`. An
 * unmarked abort may have ended a DNS lookup queued behind other hosts'
 * lookups, which any caller can cause, so it does not count.
 */
export function isTransientAbort(error: unknown, signal: AbortSignal): boolean {
	return (
		signal.aborted &&
		someErrorInCauseChain(
			error,
			(candidate) =>
				(candidate as { code?: unknown }).code === REQUEST_ABORTED_CODE,
		)
	);
}
