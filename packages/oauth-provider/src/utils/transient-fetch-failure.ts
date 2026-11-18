/**
 * Error codes of connection failures that a later attempt can get past. A
 * name that does not resolve (`ENOTFOUND`) is not one of them. The `UND_ERR_`
 * codes are those the runtime's built-in fetch sets on its connect, header,
 * and body timeouts and on a socket that closed early.
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

/**
 * HTTP statuses that a later request can get past.
 *
 * @see https://www.rfc-editor.org/rfc/rfc5861#section-4
 */
const TRANSIENT_HTTP_STATUSES = new Set([500, 502, 503, 504]);

/**
 * Error codes a transport sets when it refuses a fetch at a local capacity
 * limit, such as its limit on outstanding DNS lookups. The refusal says
 * nothing about the host.
 */
const LOCAL_CAPACITY_ERROR_CODES = new Set(["ERR_CIMD_DNS_LOOKUP_LIMIT"]);

const MAX_CAUSE_DEPTH = 8;

function someErrorInCauseChain(
	error: unknown,
	predicate: (candidate: object) => boolean,
): boolean {
	const seen = new Set<unknown>();
	let candidate = error;
	for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
		if (typeof candidate !== "object" || candidate === null) return false;
		if (seen.has(candidate)) return false;
		seen.add(candidate);
		if (predicate(candidate)) return true;
		candidate = (candidate as { cause?: unknown }).cause;
	}
	return false;
}

/**
 * Whether a transport error, or an error in its `cause` chain, carries the code
 * of a connection failure that a later attempt can get past, such as a reset
 * or refused connection. Errors without such a code, including refusals by the
 * transport's own address policy, are not transient.
 */
export function isTransientNetworkError(error: unknown): boolean {
	return someErrorInCauseChain(error, (candidate) => {
		const code = (candidate as { code?: unknown }).code;
		return typeof code === "string" && TRANSIENT_NETWORK_ERROR_CODES.has(code);
	});
}

/**
 * Whether a transport error, or an error in its `cause` chain, marks a refusal
 * at a local capacity limit rather than a failure of the host.
 */
export function isLocalCapacityRefusal(error: unknown): boolean {
	return someErrorInCauseChain(error, (candidate) => {
		const code = (candidate as { code?: unknown }).code;
		return typeof code === "string" && LOCAL_CAPACITY_ERROR_CODES.has(code);
	});
}

/**
 * Whether an HTTP response status is a server failure that a later request can
 * get past: 500, 502, 503, or 504.
 */
export function isTransientHttpStatus(status: number): boolean {
	return TRANSIENT_HTTP_STATUSES.has(status);
}

/**
 * Whether a transport error was caused by aborting `signal`, either directly
 * or through its `cause` chain.
 */
export function isAbortedBySignal(
	error: unknown,
	signal: AbortSignal,
): boolean {
	if (!signal.aborted) return false;
	return someErrorInCauseChain(
		error,
		(candidate) =>
			candidate === signal.reason ||
			(candidate as { name?: unknown }).name === "AbortError",
	);
}
