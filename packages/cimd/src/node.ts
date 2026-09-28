import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { Readable } from "node:stream";
import { isPublicRoutableHost } from "@better-auth/core/utils/host";
import type { ClientMetadataResourceFetch } from "@better-auth/oauth-provider";

const BODY_FORBIDDEN_RESPONSE_STATUSES = new Set([204, 205, 304]);

/**
 * Resolve a hostname while honoring the caller's AbortSignal.
 *
 * `dns.lookup` itself cannot be cancelled, so an aborted call leaves one
 * bounded lookup outstanding per request; it settles in the background and
 * its result is discarded. What changes is that we stop *awaiting* it as
 * soon as the caller's deadline fires instead of letting a stalled resolver
 * defeat the deadline.
 */
function lookupWithAbort(
	hostname: string,
	signal: AbortSignal | undefined,
): ReturnType<typeof lookup> {
	if (signal?.aborted) {
		return Promise.reject(signal.reason);
	}
	const lookupPromise = lookup(hostname, {
		all: true,
		verbatim: true,
	});
	if (!signal) {
		return lookupPromise;
	}
	return new Promise((resolve, reject) => {
		const onAbort = () => {
			reject(signal.reason);
		};
		signal.addEventListener("abort", onAbort, { once: true });
		const cleanup = () => signal.removeEventListener("abort", onAbort);
		lookupPromise.then(
			(addresses) => {
				cleanup();
				resolve(addresses);
			},
			(error) => {
				cleanup();
				reject(error);
			},
		);
	});
}

function responseHeaders(
	headers: Record<string, string | string[] | undefined>,
): Headers {
	const result = new Headers();
	for (const [name, value] of Object.entries(headers)) {
		if (Array.isArray(value)) {
			for (const item of value) result.append(name, item);
		} else if (value !== undefined) {
			result.append(name, value);
		}
	}
	return result;
}

/**
 * Fetch a CIMD-owned HTTPS resource with resolve-once DNS validation and
 * connection pinning.
 *
 * Every DNS answer must be public-routable. The selected answer is pinned for
 * the connection while the original hostname remains the HTTP Host, TLS SNI,
 * and certificate-verification identity. Redirect responses are returned to
 * the caller and are never followed.
 */
export const fetchClientMetadataResource: ClientMetadataResourceFetch = async (
	input,
	init,
) => {
	const webRequest = new Request(input, init);
	const url = new URL(webRequest.url);
	if (url.protocol !== "https:") {
		throw new TypeError("CIMD Node transport requires an HTTPS URL");
	}
	if (webRequest.method !== "GET" && webRequest.method !== "HEAD") {
		throw new TypeError("CIMD Node transport supports only GET and HEAD");
	}

	const signal =
		init?.signal ??
		(input instanceof Request ? input.signal : webRequest.signal);

	const addresses = await lookupWithAbort(url.hostname, signal);
	if (addresses.length === 0) {
		throw new TypeError("metadata hostname returned no DNS addresses");
	}
	for (const result of addresses) {
		if (!isPublicRoutableHost(result.address)) {
			throw new TypeError(
				"metadata hostname must resolve only to public-routable addresses",
			);
		}
	}
	const pinnedAddress = addresses[0] as (typeof addresses)[number];

	const headers = Object.fromEntries(webRequest.headers.entries());
	headers.host = url.host;

	return new Promise<Response>((resolve, reject) => {
		const request = httpsRequest(
			url,
			{
				agent: false,
				headers,
				method: webRequest.method,
				servername:
					isIP(url.hostname.replace(/^\[|\]$/g, "")) === 0
						? url.hostname
						: undefined,
				signal,
				/**
				 * Node requests all lookup results when automatic address-family
				 * selection is enabled. The callback must receive an address array for
				 * `all: true`, and the legacy address and family arguments otherwise.
				 * Both forms return only the previously validated address to preserve
				 * connection pinning.
				 *
				 * @see https://nodejs.org/api/net.html#socketconnectoptions-connectlistener
				 * @see https://nodejs.org/api/dns.html#dnslookuphostname-options-callback
				 */
				lookup: (_hostname, options, callback) => {
					if (options.all) {
						callback(null, [pinnedAddress]);
					} else {
						callback(null, pinnedAddress.address, pinnedAddress.family);
					}
				},
			},
			(response) => {
				const status = response.statusCode ?? 500;
				const body =
					webRequest.method === "HEAD" ||
					BODY_FORBIDDEN_RESPONSE_STATUSES.has(status)
						? null
						: (Readable.toWeb(
								response,
							) as unknown as ReadableStream<Uint8Array>);
				resolve(
					new Response(body, {
						headers: responseHeaders(response.headers),
						status,
						statusText: response.statusMessage,
					}),
				);
			},
		);
		request.once("error", reject);
		request.end();
	});
};
