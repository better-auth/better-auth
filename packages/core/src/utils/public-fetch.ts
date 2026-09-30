// cspell:ignore workerd opaqueredirect
import type { BetterFetchOption } from "@better-fetch/fetch";
import { betterFetch } from "@better-fetch/fetch";
import { BetterAuthError } from "../error";
import { classifyHost, isPublicRoutableHost } from "./host";
import { isValidIP } from "./ip";

/**
 * Shared fetch boundary for provider, client, and discovery-controlled auth
 * URLs. Redirect refusal is always on. Host gating runs only when the caller
 * passes `isTrustedOrigin`.
 *
 * DNS validation is pre-connect only: a rebind between lookup and fetch is still
 * possible. Hostname validation requires a working DNS API. Approved origins
 * and public IP literals do not require resolution.
 */

const httpRedirectStatuses = new Set([301, 302, 303, 307, 308]);
const DNS_CHECK_TIMEOUT_MS = 5_000;

function isLookupUnsupported(error: unknown): boolean {
	return (
		error instanceof Error &&
		(/not implemented/i.test(error.message) ||
			("code" in error && error.code === "ERR_NOT_IMPLEMENTED"))
	);
}

function isMissingDnsRecord(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error.code === "ENODATA" || error.code === "ENOTFOUND")
	);
}

async function resolveAddresses(host: string): Promise<string[]> {
	const dns = await import("node:dns/promises");
	try {
		const addresses = await dns.lookup(host, { all: true });
		return addresses.map(({ address }) => address);
	} catch (error) {
		// Record queries preserve hostname checks on runtimes without lookup.
		// Do not replace a failed system lookup with a different DNS policy.
		if (!isLookupUnsupported(error)) throw error;
	}
	const results = await Promise.allSettled([
		dns.resolve4(host),
		dns.resolve6(host),
	]);
	const addresses: string[] = [];
	for (const result of results) {
		if (result.status === "fulfilled") addresses.push(...result.value);
		else if (!isMissingDnsRecord(result.reason)) throw result.reason;
	}
	return addresses;
}

async function resolveAddressesWithinDeadline(host: string): Promise<string[]> {
	let timeout: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			resolveAddresses(host),
			new Promise<never>((_, reject) => {
				timeout = setTimeout(() => {
					reject(new Error("DNS validation timed out"));
				}, DNS_CHECK_TIMEOUT_MS);
			}),
		]);
	} finally {
		clearTimeout(timeout);
	}
}

/**
 * Detects both HTTP redirect statuses and opaque manual-mode redirects.
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

/** A server-side request refused by the shared fetch policy. */
export type SsrfRefusedError = BetterAuthError & {
	readonly code: SsrfRefusedCode;
	readonly url: string;
	readonly resolvedAddress?: string;
};

/** Creates a typed refusal error using the existing Better Auth error base. */
export function createSsrfRefusedError(
	code: SsrfRefusedCode,
	message: string,
	url: string,
	resolvedAddress?: string,
): SsrfRefusedError {
	return Object.assign(new BetterAuthError(message), {
		name: "SsrfRefusedError",
		code,
		url,
		resolvedAddress,
	});
}

/** Recognizes an Error carrying valid fetch-refusal metadata. */
export function isSsrfRefusedError(error: unknown): error is SsrfRefusedError {
	return (
		error instanceof Error &&
		error.name === "SsrfRefusedError" &&
		"code" in error &&
		(error.code === "ssrf_invalid_url" ||
			error.code === "ssrf_private_host" ||
			error.code === "ssrf_dns_lookup_failed" ||
			error.code === "ssrf_redirect_refused") &&
		"url" in error &&
		typeof error.url === "string" &&
		(!("resolvedAddress" in error) ||
			error.resolvedAddress === undefined ||
			typeof error.resolvedAddress === "string")
	);
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
		throw createSsrfRefusedError(
			"ssrf_invalid_url",
			`The URL is not valid: ${String(target)}`,
			String(target),
		);
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		throw createSsrfRefusedError(
			"ssrf_invalid_url",
			`The URL must use http or https: ${url.toString()}`,
			url.toString(),
		);
	}
	return url;
}

function redirectRefused(url: string): SsrfRefusedError {
	return createSsrfRefusedError(
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
		throw createSsrfRefusedError(
			"ssrf_private_host",
			`The host "${host}" is not publicly routable.`,
			url.toString(),
		);
	}

	// IP literals are fully covered by the synchronous check; only FQDNs can
	// resolve to a different address than they appear to.
	if (classifyHost(host).literal !== "fqdn") return;

	let resolved: string[];
	try {
		resolved = await resolveAddressesWithinDeadline(host);
		// Some runtime resolvers include CNAME records alongside IP answers.
		// Alias names are not approved addresses; require and check actual IPs.
		resolved = resolved.filter((address) => {
			if (isValidIP(address)) return true;
			if (
				address.length > 253 ||
				!address
					.replace(/\.$/, "")
					.split(".")
					.every((label) =>
						/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label),
					)
			)
				throw new Error("DNS validation returned an invalid answer");
			return false;
		});
		if (resolved.length === 0) {
			throw new Error("DNS validation returned no usable IP addresses");
		}
	} catch {
		throw createSsrfRefusedError(
			"ssrf_dns_lookup_failed",
			`The host "${host}" could not be checked by the DNS resolver before a server-side fetch. Check the hostname, DNS availability, and runtime resolver support.`,
			url.toString(),
		);
	}

	for (const address of resolved) {
		if (!isPublicRoutableHost(address)) {
			throw createSsrfRefusedError(
				"ssrf_private_host",
				`The host "${host}" resolves to a non-publicly-routable address (${address}).`,
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
