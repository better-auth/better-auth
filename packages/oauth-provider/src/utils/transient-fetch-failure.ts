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
