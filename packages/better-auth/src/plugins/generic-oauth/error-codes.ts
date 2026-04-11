import { defineErrorCodes } from "@better-auth/core/utils/error-codes";

export const GENERIC_OAUTH_ERROR_CODES = defineErrorCodes({
	INVALID_OAUTH_CONFIGURATION: "Invalid OAuth configuration",
	TOKEN_URL_NOT_FOUND: "Invalid OAuth configuration. Token URL not found.",
});

/**
 * Error codes used in OAuth callback redirects (`?error=<code>`).
 * These are URL-safe strings, not API error objects.
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
	EMAIL_DOESNT_MATCH: "email_doesn't_match",
	ACCOUNT_ALREADY_LINKED_TO_DIFFERENT_USER:
		"account_already_linked_to_different_user",
	EMAIL_NOT_FOUND: "email_not_found",
} as const;
