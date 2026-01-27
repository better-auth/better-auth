import { defineErrorCodes } from "@better-auth/core/utils/error-codes";

export const GENERIC_OAUTH_ERROR_CODES = defineErrorCodes({
	ERR_INVALID_OAUTH_CONFIGURATION: "Invalid OAuth configuration",
	ERR_TOKEN_URL_NOT_FOUND: "Invalid OAuth configuration. Token URL not found.",
	ERR_PROVIDER_CONFIG_NOT_FOUND: "No config found for provider",
	ERR_PROVIDER_ID_REQUIRED: "Provider ID is required",
	ERR_INVALID_OAUTH_CONFIG: "Invalid OAuth configuration.",
	ERR_SESSION_REQUIRED: "Session is required",
});
