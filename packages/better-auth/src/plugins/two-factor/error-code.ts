import { defineErrorCodes } from "@better-auth/core/utils/error-codes";

export const TWO_FACTOR_ERROR_CODES = defineErrorCodes({
	METHOD_NOT_FOUND: "Two-factor method not found",
	METHOD_NOT_READY: "Two-factor method is not ready",
	CODE_DELIVERY_NOT_SUPPORTED: "The selected method cannot receive a code",
	CODE_HAS_EXPIRED: "The verification code has expired",
	RECOVERY_CODES_NOT_ENABLED: "Recovery codes aren't enabled",
	INVALID_CODE: "Invalid code",
	TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE:
		"Too many attempts. Please sign in again.",
	INVALID_PENDING_CHALLENGE: "Invalid pending two-factor challenge",
	TRUSTED_DEVICE_NOT_FOUND: "Trusted device not found",
});
