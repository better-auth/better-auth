export const TWO_FACTOR_ERROR_CODES = {
	OTP_NOT_ENABLED: "OTP not enabled",
	OTP_HAS_EXPIRED: "OTP has expired",
	TOTP_NOT_ENABLED: "TOTP not enabled",
	TWO_FACTOR_NOT_ENABLED: "Two factor isn't enabled",
	BACKUP_CODES_NOT_ENABLED: "Backup codes aren't enabled",
	INVALID_BACKUP_CODE: "Invalid backup code",
	INVALID_VERIFICATION_METHOD: "Invalid verification method",
    EMAIL_OTP_EXPIRED: "Email verification code has expired",
    INVALID_EMAIL_OTP: "Invalid email verification code",
	INVALID_OTP: "Invalid OTP",
    EMAIL_OTP_REQUIRED: "Email verification code required for social login users",
} as const;
