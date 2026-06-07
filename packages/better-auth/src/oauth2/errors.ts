import type { GenericEndpointContext } from "@better-auth/core";

/**
 * Error codes used in OAuth callback redirects (`?error=<code>`). These are
 * URL-safe strings, not API error objects. Some also serve as the OAuth seam's
 * machine-readable `result.error` value, which non-redirect callers (e.g.
 * id-token sign-in) remap to an API error code.
 */
export const OAUTH_CALLBACK_ERROR_CODES = {
	NO_CODE: "no_code",
	PROVIDER_NOT_FOUND: "oauth_provider_not_found",
	ISSUER_MISSING: "issuer_missing",
	ISSUER_MISMATCH: "issuer_mismatch",
	INVALID_CODE: "invalid_code",
	UNABLE_TO_GET_USER_INFO: "unable_to_get_user_info",
	NO_CALLBACK_URL: "no_callback_url",
	UNABLE_TO_LINK_ACCOUNT: "unable_to_link_account",
	EMAIL_DOES_NOT_MATCH: "email_does_not_match",
	ACCOUNT_ALREADY_LINKED_TO_DIFFERENT_USER:
		"account_already_linked_to_different_user",
	EMAIL_NOT_FOUND: "email_not_found",
	EMAIL_NOT_VERIFIED: "email_not_verified",
} as const;

const HANDLING_DOCS_URL =
	"https://www.better-auth.com/docs/concepts/oauth#handling-providers-without-email";

/**
 * Redirect the user to the OAuth error page with a machine-readable `error`
 * code (and optional `error_description`).
 *
 * Every OAuth callback path routes its failures through this helper so the
 * query parameter name, the `?`/`&` separator, and URL encoding are decided in
 * one place. The error page reads the `error` query parameter, so callers must
 * never hand-build the redirect with a different parameter name.
 */
export function redirectOnError(
	ctx: GenericEndpointContext,
	errorURL: string,
	error: string,
	description?: string,
): never {
	const params = new URLSearchParams({ error });
	if (description) params.set("error_description", description);
	const sep = errorURL.includes("?") ? "&" : "?";
	throw ctx.redirect(`${errorURL}${sep}${params.toString()}`);
}

/**
 * Build the logger message shown when an OAuth provider does not return an
 * email address. Kept in one place so every rejection site points users at
 * the same workaround docs.
 */
export function missingEmailLogMessage(
	providerId: string,
	options?: { source?: "id_token" | "generic" },
): string {
	const subject =
		options?.source === "generic"
			? `Generic OAuth provider "${providerId}"`
			: `Provider "${providerId}"`;
	const where = options?.source === "id_token" ? " in the id token" : "";
	return `${subject} did not return an email${where}. Either request the provider's email scope, or synthesize one via \`mapProfileToUser\`. See ${HANDLING_DOCS_URL}`;
}
