import { defineErrorCodes } from "@better-auth/core/utils/error-codes";

export const GENERIC_OAUTH_ERROR_CODES = defineErrorCodes({
	INVALID_OAUTH_CONFIGURATION: "Invalid OAuth configuration",
	TOKEN_URL_NOT_FOUND: "Invalid OAuth configuration. Token URL not found.",
});

export { OAUTH_CALLBACK_ERROR_CODES } from "../../oauth2/error-codes";
