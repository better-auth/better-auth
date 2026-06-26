// cspell:ignore workerd opaqueredirect
import type { BetterFetchOption } from "@better-fetch/fetch";
import { betterFetch } from "@better-fetch/fetch";
import { BetterAuthError } from "../error";
import { classifyHost, isPublicRoutableHost } from "./host";

/**
 * Single chokepoint for server-side fetches to a URL that an authenticated user
 * or remote provider can influence: OAuth/OIDC token, refresh, introspection,
 * discovery, userinfo, and JWKS endpoints, and OAuth client-metadata documents.
 *
 * Two protections with different scopes:
 *   - Redirect refusal is universal: a 3xx is never followed to a new host, on
 *     every fetch, because a conformant endpoint answers these requests directly.
 *   - The host gate (classify + DNS resolve + re-classify) is for URLs whose host
 *     an external party can influence (a registered SSO/OIDC provider, an OAuth
 *     client-metadata document). A consumer opts in by supplying `trustedOrigins`,
 *     its allowlist of internal hosts. Endpoints the application configures
 *     directly (built-in social providers) omit it: the operator already trusts
 *     that host, so only redirect refusal applies and no DNS lookup is spent.
 *
 * Host gate layers, when enabled:
 *   1. URL parse + http(s) scheme   -> ssrf_invalid_url
 *   2. Public-routable literal host  -> {@link isPublicRoutableHost} (RFC 6890)
 *   3. trustedOrigins escape hatch   -> operator opt-in for internal services
 *   4. DNS resolve + re-classify     -> rejects FQDNs that resolve to private IPs
 *
 * Best-effort by design. The DNS step resolves once and validates the result;
 * it does not pin the address for the subsequent connection, so a rebind between
 * this lookup and the fetch is theoretically possible. On runtimes without
 * `node:dns` (Cloudflare Workers, edge) the resolve step is skipped and the
 * synchronous host check plus the platform's egress controls apply. Routing
 * every outbound fetch through this module keeps a future connection-pinning
 * dispatcher a single-file change rather than a contract change.
 */

const httpRedirectStatuses = new Set([301, 302, 303, 307, 308]);

/**
 * Whether a response from a `redirect: "manual"` fetch is a redirect.
 *
 * Node/undici exposes the real 3xx status. Spec-compliant runtimes (Cloudflare
 * Workers, Deno, browsers) return an opaque-redirect filtered response with
 * status 0 and type `"opaqueredirect"`, so the status alone is not enough.
 *
 * Exported for callers that own their transport (an Electron `net.fetch`, a
 * size-capped streaming reader) and must detect a manual-mode redirect on a
 * response they fetched themselves.
 */
export function isRedirectResponse(response: Response): boolean {
	return (
		response.type === "opaqueredirect" ||
		httpRedirectStatuses.has(response.status)
	);
}

export type SsrfRefusedCode =
	| "ssrf_invalid_url"
	| "ssrf_private_host"
	| "ssrf_redirect_refused";

export class SsrfRefusedError extends BetterAuthError {
	readonly code: SsrfRefusedCode;
	readonly url: string;
	readonly resolvedAddress?: string;

	constructor(
		code: SsrfRefusedCode,
		message: string,
		url: string,
		resolvedAddress?: string,
	) {
		super(message);
		this.name = "SsrfRefusedError";
		this.code = code;
		this.url = url;
		this.resolvedAddress = resolvedAddress;
	}
}

export interface PublicFetchOptions {
	/**
	 * The consumer's allowlist of internal origins. Supplying it enables the
	 * host gate: the target host is classified and resolved, and anything that is
	 * not publicly routable is rejected unless this predicate allows it (the
	 * escape hatch for an internal IdP on a private network). Omitting it leaves
	 * the host unchecked; only redirect refusal applies. Pass this for endpoints an
	 * external party can influence; omit it for endpoints your application
	 * configures directly.
	 */
	trustedOrigins?: (url: string) => boolean;
}

function parsePublicUrl(target: string | URL): URL {
	let url: URL;
	try {
		url = new URL(target);
	} catch {
		throw new SsrfRefusedError(
			"ssrf_invalid_url",
			`The URL is not valid: ${String(target)}`,
			String(target),
		);
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		throw new SsrfRefusedError(
			"ssrf_invalid_url",
			`The URL must use http or https: ${url.toString()}`,
			url.toString(),
		);
	}
	return url;
}

function redirectRefused(url: string): SsrfRefusedError {
	return new SsrfRefusedError(
		"ssrf_redirect_refused",
		`The endpoint "${url}" returned an HTTP redirect. Server-side fetches refuse redirects to prevent SSRF; configure the final endpoint URL.`,
		url,
	);
}

/**
 * Run the host gate explicitly, for callers that own their transport (an
 * Electron `net.fetch`, a size-capped streaming reader) and cannot delegate the
 * request to {@link fetchPublicResource}. This always classifies and resolves
 * the host; `trustedOrigins` is the allowlist, not a switch.
 *
 * @throws SsrfRefusedError on a malformed URL, non-public host, or a host that
 * resolves to a non-public address.
 */
export async function assertPublicFetchTarget(
	target: string | URL,
	options?: PublicFetchOptions,
): Promise<void> {
	const url = parsePublicUrl(target);

	if (options?.trustedOrigins?.(url.toString())) return;

	const host = url.hostname;
	if (!isPublicRoutableHost(host)) {
		throw new SsrfRefusedError(
			"ssrf_private_host",
			`The host "${host}" is not publicly routable. If this is an internal service, add its origin to trustedOrigins.`,
			url.toString(),
		);
	}

	// IP literals are fully covered by the synchronous check; only FQDNs can
	// resolve to a different address than they appear to.
	if (classifyHost(host).literal !== "fqdn") return;

	let dns: typeof import("node:dns/promises");
	try {
		dns = await import("node:dns/promises");
	} catch {
		// Runtime without node:dns (Workers/edge): rely on the synchronous host
		// check and the platform's own egress controls.
		return;
	}

	let resolved: Array<{ address: string }>;
	try {
		resolved = await dns.lookup(host, { all: true });
	} catch {
		// Resolution failure: let the actual fetch surface the network error.
		return;
	}

	for (const { address } of resolved) {
		if (!isPublicRoutableHost(address)) {
			throw new SsrfRefusedError(
				"ssrf_private_host",
				`The host "${host}" resolves to a non-publicly-routable address (${address}). If this is an internal service, add its origin to trustedOrigins.`,
				url.toString(),
				address,
			);
		}
	}
}

/**
 * `betterFetch` that refuses redirects, for callers that want the `{ data, error }`
 * shape (OAuth token, refresh, client-credentials, introspection, JWKS). Supply
 * `trustedOrigins` to also gate the host (see {@link PublicFetchOptions}).
 *
 * @throws SsrfRefusedError if the endpoint redirects, or if `trustedOrigins` is
 * supplied and the target host is not public.
 */
export async function fetchPublicResource<T>(
	target: string,
	options?: BetterFetchOption & PublicFetchOptions,
) {
	const { trustedOrigins, ...fetchOptions } = options ?? {};
	if (trustedOrigins) await assertPublicFetchTarget(target, { trustedOrigins });

	let redirected = false;
	const onError = fetchOptions.onError;
	const result = await betterFetch<T>(target, {
		...fetchOptions,
		redirect: "manual",
		async onError(context) {
			if (isRedirectResponse(context.response)) redirected = true;
			await onError?.(context);
		},
	}).catch((error) => {
		if (redirected) throw redirectRefused(target);
		throw error;
	});
	if (redirected) throw redirectRefused(target);
	return result;
}

/**
 * Native-`fetch` that refuses redirects, returning the `Response`. For jose's
 * `createRemoteJWKSet` custom-fetch hook and other callers that need the raw
 * response. Supply `trustedOrigins` to also gate the host (see
 * {@link PublicFetchOptions}).
 *
 * @throws SsrfRefusedError if the endpoint redirects, or if `trustedOrigins` is
 * supplied and the target host is not public.
 */
export async function fetchPublicResponse(
	target: string | URL,
	init: RequestInit,
	options?: PublicFetchOptions,
): Promise<Response> {
	if (options?.trustedOrigins) await assertPublicFetchTarget(target, options);
	const response = await fetch(target, { ...init, redirect: "manual" });
	if (isRedirectResponse(response)) throw redirectRefused(String(target));
	return response;
}
