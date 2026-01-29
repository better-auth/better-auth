import { defineErrorCodes } from "@better-auth/core/utils/error-codes";

export const GENERIC_OAUTH_ERROR_CODES = defineErrorCodes({
	INVALID_OAUTH_CONFIGURATION: "Invalid OAuth configuration",
	TOKEN_URL_NOT_FOUND: "Invalid OAuth configuration. Token URL not found.",
	PROVIDER_CONFIG_NOT_FOUND: "No config found for provider",
	PROVIDER_ID_REQUIRED: "Provider ID is required",
	INVALID_OAUTH_CONFIG: "Invalid OAuth configuration.",
	SESSION_REQUIRED: "Session is required",
	ISSUER_MISMATCH:
		"OAuth issuer mismatch. The authorization server issuer does not match the expected value (RFC 9207).",
	ISSUER_MISSING:
		"OAuth issuer parameter missing. The authorization server did not include the required iss parameter (RFC 9207).",
});
