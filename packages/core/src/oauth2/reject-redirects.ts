// cspell:ignore workerd
import type { BetterFetchOption } from "@better-fetch/fetch";
import { betterFetch } from "@better-fetch/fetch";
import { BetterAuthError } from "../error";

const HTTP_REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * Whether a response from a `redirect: "manual"` fetch is a redirect.
 *
 * Node/undici exposes the real 3xx status. Spec-compliant runtimes (Cloudflare
 * Workers, Deno, browsers) return an opaque-redirect filtered response with
 * status 0 and type `"opaqueredirect"`, so the status alone is not enough.
 */
function isRedirectResponse(response: Response): boolean {
	return (
		response.type === "opaqueredirect" ||
		HTTP_REDIRECT_STATUSES.has(response.status)
	);
}

function redirectRefused(endpoint: string): BetterAuthError {
	return new BetterAuthError(
		`The OAuth endpoint "${endpoint}" returned an HTTP redirect. Server-side OAuth fetches refuse redirects to prevent SSRF; configure the final endpoint URL.`,
	);
}

/**
 * Fetch option that refuses HTTP redirects portably.
 *
 * Cloudflare Workers (workerd) rejects `redirect: "error"`, so manual mode is
 * used and the resolved response is checked with {@link assertResponseNotRedirect}
 * (or, for betterFetch, with {@link fetchRefusingRedirects}).
 */
export const NO_FOLLOW_REDIRECT = { redirect: "manual" } as const;

/**
 * Throw when a native-`fetch` response (e.g. jose's JWKS loader) resolved to a
 * redirect, so an attacker-influenced endpoint cannot bounce a server-side
 * request to an internal address.
 */
export function assertResponseNotRedirect(
	endpoint: string,
	response: Response,
): void {
	if (isRedirectResponse(response)) throw redirectRefused(endpoint);
}

/**
 * betterFetch that refuses HTTP redirects on a server-side OAuth fetch.
 *
 * Returns the betterFetch result and throws if the endpoint redirected, on both
 * undici (real 3xx status) and spec-compliant runtimes (opaque redirect, where
 * the error status is 0). The redirect is never followed on any runtime.
 */
export async function fetchRefusingRedirects<T>(
	url: string,
	options?: BetterFetchOption,
) {
	let redirected = false;
	const result = await betterFetch<T>(url, {
		...options,
		...NO_FOLLOW_REDIRECT,
		onError(context) {
			if (isRedirectResponse(context.response)) redirected = true;
		},
	});
	if (redirected) throw redirectRefused(url);
	return result;
}
