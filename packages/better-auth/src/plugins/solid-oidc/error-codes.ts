import { defineErrorCodes } from "@better-auth/core/utils/error-codes";

/**
 * Only failures that reach the caller as an API error are listed here.
 *
 * The identity checks — a missing ID token, a failed signature, an absent
 * WebID, an unconfirmed issuer — happen inside `getUserInfo`, whose contract is
 * to return `null`. Those are logged and surface as the shared OAuth callback's
 * generic error redirect rather than as codes a client can branch on.
 */
export const SOLID_OIDC_ERROR_CODES = defineErrorCodes({
	SOLID_ISSUER_DISCOVERY_FAILED:
		"Could not discover the Solid OpenID Provider configuration",
	SOLID_ISSUER_MISMATCH:
		"The Solid OpenID Provider discovery document reports a different issuer",
	CLIENT_ID_DOCUMENT_DISABLED:
		"This Solid-OIDC provider does not serve a Client Identifier Document",
	TOKEN_NOT_DPOP_BOUND:
		"The Solid OpenID Provider did not return a DPoP-bound token",
	DPOP_KEY_NOT_FOUND:
		"No DPoP key is bound to this Solid refresh token, so it cannot be refreshed",
});
