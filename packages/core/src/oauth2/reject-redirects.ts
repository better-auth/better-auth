// cspell:ignore workerd
import { BetterAuthError } from "../error";

/**
 * HTTP redirect status codes.
 *
 * A conformant OAuth token, introspection, or JWKS endpoint answers with a
 * direct JSON body and never redirects (RFC 6749 §5.1). These endpoints are
 * reached through SSO/OIDC discovery, where their URLs are influenced by data an
 * authenticated user can register, so following a redirect could bounce a
 * server-side request to an internal address.
 */
const HTTP_REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function isHttpRedirectStatus(status: number | undefined | null): boolean {
	return typeof status === "number" && HTTP_REDIRECT_STATUSES.has(status);
}

/**
 * Fetch option that refuses HTTP redirects portably.
 *
 * Cloudflare Workers (workerd) rejects `redirect: "error"`, so manual mode is
 * used: a 3xx surfaces as a non-ok response that the caller rejects with
 * {@link assertNoRedirect}.
 */
export const NO_FOLLOW_REDIRECT = { redirect: "manual" } as const;

/**
 * Throw when a server-side OAuth fetch resolved to an HTTP redirect, so an
 * attacker-influenced endpoint cannot bounce the request to an internal
 * address. Call right after a fetch issued with {@link NO_FOLLOW_REDIRECT},
 * passing the response status (native `fetch`) or the error status
 * (`betterFetch`, which surfaces a 3xx as a non-ok error).
 */
export function assertNoRedirect(
	endpoint: string,
	status: number | undefined | null,
): void {
	if (isHttpRedirectStatus(status)) {
		throw new BetterAuthError(
			`The OAuth endpoint "${endpoint}" returned an HTTP ${status} redirect. Server-side OAuth fetches refuse redirects to prevent SSRF; configure the final endpoint URL.`,
		);
	}
}
