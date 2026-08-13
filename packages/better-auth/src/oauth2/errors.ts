import type { GenericEndpointContext } from "@better-auth/core";
import { resolveErrorRedirectUrl } from "@better-auth/core/utils/error-url";

const HANDLING_DOCS_URL =
	"https://www.better-auth.com/docs/concepts/oauth#handling-providers-without-email";

/**
 * Redirect the user to the OAuth error page with a machine-readable `error`
 * code (and optional `error_description`).
 *
 * Every OAuth callback path routes its failures through this helper so the
 * query parameter name, encoding, and `errorUrlBuilder` (when configured)
 * are decided in one place.
 */
export async function redirectOnError(
	ctx: GenericEndpointContext,
	errorURL: string,
	error: string,
	description?: string,
): Promise<never> {
	const url = await resolveErrorRedirectUrl(ctx.context.options, errorURL, {
		error,
		error_description: description,
	});
	throw ctx.redirect(url);
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
