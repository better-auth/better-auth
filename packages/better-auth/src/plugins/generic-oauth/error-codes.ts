import { defineErrorCodes } from "@better-auth/core/utils/error-codes";

export const GENERIC_OAUTH_ERROR_CODES = defineErrorCodes({
	INVALID_OAUTH_CONFIGURATION: "Invalid OAuth configuration",
	TOKEN_URL_NOT_FOUND: "Invalid OAuth configuration. Token URL not found.",
	OAUTH_PROVIDER_UNAVAILABLE: "OAuth provider is temporarily unavailable",
});
