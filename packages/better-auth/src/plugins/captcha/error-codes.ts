// These error codes are returned by the API
import { defineErrorCodes } from "@better-auth/core/utils/error-codes";

export const CAPCHA_CLIENT_SIDE_ERROR_CODES = defineErrorCodes({
	ERR_VERIFICATION_FAILED: "Captcha verification failed",
	ERR_MISSING_RESPONSE: "Missing CAPTCHA response",
	ERR_UNKNOWN_ERROR: "Something went wrong",
});

export const CAPTCHA_SERVER_SIDE_ERROR_CODES = defineErrorCodes({
	ERR_MISSING_SECRET_KEY: "Missing secret key",
	ERR_SERVICE_UNAVAILABLE: "CAPTCHA service unavailable",
});
