import type { LookupAddress } from "node:dns";
import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { Readable } from "node:stream";
import {
	classifyHost,
	isPublicRoutableHost,
} from "@better-auth/core/utils/host";
import type { ClientMetadataResourceFetch } from "@better-auth/oauth-provider";

const BODY_FORBIDDEN_RESPONSE_STATUSES = new Set([204, 205, 304]);
// `dns.lookup` runs on Node's shared thread pool and cannot be cancelled. Keep
// abandoned lookups in this count until they actually settle.
const MAX_OUTSTANDING_DNS_LOOKUPS = 16;
let outstandingDNSLookups = 0;

/**
 * Resolve every address of a hostname, rejecting with the signal's reason as
 * soon as it aborts. An abandoned lookup keeps its slot in
 * MAX_OUTSTANDING_DNS_LOOKUPS until it settles, and its result is discarded.
 */
function lookupWithAbort(
	hostname: string,
	signal: AbortSignal | undefined,
): Promise<LookupAddress[]> {
	if (outstandingDNSLookups >= MAX_OUTSTANDING_DNS_LOOKUPS) {
		// The code marks a local capacity limit, so callers can tell it apart from
		// a refusal of the host.
		return Promise.reject(
			Object.assign(new TypeError("metadata DNS lookup limit exceeded"), {
				code: "ERR_CIMD_DNS_LOOKUP_LIMIT",
			}),
		);
	}
	outstandingDNSLookups += 1;
	let lookupPromise: Promise<LookupAddress[]>;
	try {
		lookupPromise = lookup(hostname, {
			all: true,
			verbatim: true,
		});
	} catch (error) {
		outstandingDNSLookups -= 1;
		return Promise.reject(error);
	}
	// Attach both handlers immediately, including when the caller has already
	// stopped waiting. A late error cannot become an unhandled rejection.
	const countedLookup = lookupPromise.then(
		(addresses) => {
			outstandingDNSLookups -= 1;
			return addresses;
		},
		(error) => {
			outstandingDNSLookups -= 1;
			throw error;
		},
	);
	if (!signal) {
		return countedLookup;
	}
	return new Promise((resolve, reject) => {
		const onAbort = () => {
			reject(signal.reason);
		};
		signal.addEventListener("abort", onAbort, { once: true });
		if (signal.aborted) onAbort();
		const cleanup = () => signal.removeEventListener("abort", onAbort);
		countedLookup.then(
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
 * Every DNS answer must be public-routable. The connection is limited to those
 * validated answers, so Node can fall back between them without a second DNS
 * query, while the original hostname remains the HTTP Host, TLS SNI, and
 * certificate-verification identity. An IP-literal host skips DNS and is
 * connected to directly once it is classified public-routable. It sends no
 * SNI, and its certificate must name the IP address. Redirect responses are
 * returned to the caller and are never followed.
 *
 * The abort signal is honored during DNS resolution as well as the request.
 * The underlying `getaddrinfo` call cannot be cancelled: after an abort it
 * keeps running until the resolver answers or times out. At most 16 lookups
 * may be outstanding per process, abandoned ones included, and while 16 are
 * outstanding a fetch to any hostname rejects without starting another.
 * IP-literal hosts need no lookup and are not limited.
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
	signal?.throwIfAborted();

	// A literal host has no DNS answer to pin. lookup() rejects the bracketed
	// form of an IPv6 literal, so classify the literal itself and pin it.
	const literal = classifyHost(url.hostname);
	let addresses: { address: string; family: number }[];
	if (literal.literal !== "fqdn") {
		if (literal.kind !== "public") {
			throw new TypeError(
				"metadata hostname must resolve only to public-routable addresses",
			);
		}
		addresses = [
			{
				address: literal.canonical,
				family: literal.literal === "ipv6" ? 6 : 4,
			},
		];
	} else {
		addresses = await lookupWithAbort(url.hostname, signal);
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
				 * Every address in the array was already validated as public-routable,
				 * so the full list goes back to let Node fall back when the first
				 * family is unreachable, without a second DNS query. The legacy form
				 * returns only the first validated address.
				 *
				 * @see https://nodejs.org/api/net.html#socketconnectoptions-connectlistener
				 * @see https://nodejs.org/api/dns.html#dnslookuphostname-options-callback
				 */
				lookup: (_hostname, options, callback) => {
					if (options.all) {
						callback(null, addresses);
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
				// Response throws on an out-of-range status or invalid reason phrase,
				// and a throw from this listener would escape the promise.
				try {
					resolve(
						new Response(body, {
							headers: responseHeaders(response.headers),
							status,
							statusText: response.statusMessage,
						}),
					);
				} catch (error) {
					response.destroy();
					reject(error);
				}
			},
		);
		request.once("error", reject);
		request.end();
	});
};
