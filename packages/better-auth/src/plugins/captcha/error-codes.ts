// These error codes are returned by the API
import { defineErrorCodes } from "@better-auth/core/utils/error-codes";

export const CAPTCHA_ERROR_CODES = defineErrorCodes({
	VERIFICATION_FAILED: "Captcha verification failed",
	MISSING_RESPONSE: "Missing CAPTCHA response",
	UNKNOWN_ERROR: "Something went wrong",
});

// These error codes are only visible in the server logs
export const CAPTCHA_INTERNAL_ERROR_CODES = defineErrorCodes({
	MISSING_SECRET_KEY: "Missing secret key",
	SERVICE_UNAVAILABLE: "CAPTCHA service unavailable",
});
