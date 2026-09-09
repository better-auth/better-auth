import type { IncomingHttpHeaders } from "node:http";

export const encodeToURLParams = (obj: Record<string, any>): string => {
	if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
		throw new Error("Input must be a non-null object.");
	}

	const params = new URLSearchParams();

	for (const [key, value] of Object.entries(obj)) {
		if (value !== undefined && value !== null) {
			params.append(key, String(value));
		}
	}

	return params.toString();
};

/**
 * Rejects with an `AbortError` if `promise` doesn't settle within `timeoutMs`.
 * The original promise keeps running; only the returned promise is bound by
 * the timeout.
 */
export const withTimeout = <T>(
	promise: Promise<T>,
	timeoutMs: number,
): Promise<T> => {
	let timer: ReturnType<typeof setTimeout>;
	const timeout = new Promise<never>((_resolve, reject) => {
		timer = setTimeout(() => {
			reject(new DOMException("The operation was aborted.", "AbortError"));
		}, timeoutMs);
	});

	return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

/**
 * Builds `IncomingHttpHeaders` from a Fetch `Request`, so provider libraries
 * that expect Node-style request headers (rather than the `Request` object
 * itself) can classify the current request instead of relying on ambient
 * context that may not exist outside of specific frameworks/runtimes.
 *
 * `overrides` take precedence per header name, with keys normalized to
 * lowercase. Array values (e.g. `set-cookie`) are kept as-is rather than
 * joined, since joining them would change their meaning.
 */
export const requestToIncomingHeaders = (
	request: Request,
	overrides?: IncomingHttpHeaders,
): IncomingHttpHeaders => {
	// The Fetch `Headers` iterator already yields lowercase names with
	// duplicate headers combined into a single comma-separated value.
	const headers: IncomingHttpHeaders = Object.fromEntries(request.headers);

	for (const [key, value] of Object.entries(overrides ?? {})) {
		if (value === undefined) continue;
		headers[key.toLowerCase()] = value;
	}

	return headers;
};
