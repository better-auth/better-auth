import { defineErrorCodes } from "@better-auth/core/utils/error-codes";

export const TWO_FACTOR_ERROR_CODES = defineErrorCodes({
	ERR_OTP_NOT_ENABLED: "OTP not enabled",
	ERR_OTP_HAS_EXPIRED: "OTP has expired",
	ERR_TOTP_NOT_ENABLED: "TOTP not enabled",
	ERR_TWO_FACTOR_NOT_ENABLED: "Two factor isn't enabled",
	ERR_BACKUP_CODES_NOT_ENABLED: "Backup codes aren't enabled",
	ERR_INVALID_BACKUP_CODE: "Invalid backup code",
	ERR_INVALID_CODE: "Invalid code",
	ERR_TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE:
		"Too many attempts. Please request a new code.",
	ERR_INVALID_TWO_FACTOR_COOKIE: "Invalid two factor cookie",
});
