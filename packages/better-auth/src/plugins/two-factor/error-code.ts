import { defineErrorCodes } from "@better-auth/core/utils/error-codes";

export const TWO_FACTOR_ERROR_CODES = defineErrorCodes({
	OTP_NOT_ENABLED: "OTP not enabled",
	OTP_NOT_CONFIGURED: "OTP is not available",
	OTP_HAS_EXPIRED: "OTP has expired",
	TOTP_NOT_ENABLED: "TOTP not enabled",
	TOTP_NOT_CONFIGURED: "TOTP is not available",
	TWO_FACTOR_NOT_ENABLED: "Two factor isn't enabled",
	BACKUP_CODES_NOT_ENABLED: "Backup codes aren't enabled",
	INVALID_BACKUP_CODE: "Invalid backup code",
	INVALID_CODE: "Invalid code",
	TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE:
		"Too many attempts. Please request a new code.",
	INVALID_TWO_FACTOR_COOKIE: "Invalid two factor cookie",
});
