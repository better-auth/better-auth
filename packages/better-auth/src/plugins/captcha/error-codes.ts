// These error codes are returned by the API
export const EXTERNAL_ERROR_CODES = {
	VERIFICATION_FAILED: "Captcha verification failed",
	MISSING_RESPONSE: "Missing CAPTCHA response",
	UNKNOWN_ERROR: "Something went wrong",
} as const;

// These error codes are only visible in the server logs
export const INTERNAL_ERROR_CODES = {
	MISSING_SECRET_KEY: "Missing secret key",
	SERVICE_UNAVAILABLE: "CAPTCHA service unavailable",
} as const;
