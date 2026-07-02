// cspell:ignore workerd opaqueredirect
import type { BetterFetchOption } from "@better-fetch/fetch";
import { betterFetch } from "@better-fetch/fetch";
import { BetterAuthError } from "../error";
import { classifyHost, isPublicRoutableHost } from "./host";

/**
 * Shared fetch boundary for provider, client, and discovery-controlled auth
 * URLs. Redirect refusal is always on. Host gating runs only when the caller
 * passes `isTrustedOrigin`.
 *
 * DNS validation is pre-connect only: a rebind between lookup and fetch is still
 * possible. Edge runtimes without `node:dns` keep the literal-host check and
 * rely on platform egress controls.
 */

const httpRedirectStatuses = new Set([301, 302, 303, 307, 308]);

/**
 * Detects manual-mode redirects across runtimes. Undici keeps the 3xx status;
 * Workers, Deno, and browsers expose `opaqueredirect` with status 0.
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
	| "ssrf_dns_lookup_failed"
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
	 * Enables the host gate. Return true only for configured private or internal
	 * origins that should bypass public-routability checks.
	 */
	isTrustedOrigin?: (url: string) => boolean;
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
 * Run the host gate for callers that own their transport.
 *
 * @throws SsrfRefusedError on a malformed URL, non-public host, or a host that
 * resolves to a non-public address.
 */
export async function assertPublicFetchTarget(
	target: string | URL,
	options?: PublicFetchOptions,
): Promise<void> {
	const url = parsePublicUrl(target);

	if (options?.isTrustedOrigin?.(url.toString())) return;

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
		// Workers and edge runtimes have no node:dns; keep the literal-host check.
		return;
	}

	let resolved: Array<{ address: string }>;
	try {
		resolved = await dns.lookup(host, { all: true });
	} catch {
		throw new SsrfRefusedError(
			"ssrf_dns_lookup_failed",
			`The host "${host}" could not be resolved before a server-side fetch. If this is an internal service, add its origin to trustedOrigins.`,
			url.toString(),
		);
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
 * `betterFetch` wrapper that refuses redirects. Supply `isTrustedOrigin` to
 * also gate the host.
 *
 * @throws SsrfRefusedError if the endpoint redirects, or if `isTrustedOrigin` is
 * supplied and the target host is not public.
 */
export async function fetchPublicResource<T>(
	target: string,
	options?: BetterFetchOption & PublicFetchOptions,
) {
	const { isTrustedOrigin, ...fetchOptions } = options ?? {};
	if (isTrustedOrigin)
		await assertPublicFetchTarget(target, { isTrustedOrigin });

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
 * Native `fetch` wrapper that refuses redirects and returns the raw `Response`.
 * Supply `isTrustedOrigin` to also gate the host.
 *
 * @throws SsrfRefusedError if the endpoint redirects, or if `isTrustedOrigin` is
 * supplied and the target host is not public.
 */
export async function fetchPublicResponse(
	target: string | URL,
	init: RequestInit,
	options?: PublicFetchOptions,
): Promise<Response> {
	if (options?.isTrustedOrigin) await assertPublicFetchTarget(target, options);
	const response = await fetch(target, { ...init, redirect: "manual" });
	if (isRedirectResponse(response)) {
		await response.body?.cancel().catch(() => {});
		throw redirectRefused(String(target));
	}
	return response;
}
