import type { TWO_FACTOR_ERROR_CODES } from "better-auth/plugins/two-factor";
import type { LocalizedTranslations } from "../../../types";

export const enTwoFactor: LocalizedTranslations<typeof TWO_FACTOR_ERROR_CODES> =
	{
		OTP_NOT_ENABLED: "OTP not enabled",
		OTP_NOT_CONFIGURED: "OTP not configured",
		OTP_HAS_EXPIRED: "OTP has expired",
		TOTP_NOT_ENABLED: "TOTP not enabled",
		TOTP_NOT_CONFIGURED: "TOTP not configured",
		TWO_FACTOR_NOT_ENABLED: "Two factor isn't enabled",
		BACKUP_CODES_NOT_ENABLED: "Backup codes aren't enabled",
		INVALID_BACKUP_CODE: "The backup code is invalid or has already been used.",
		INVALID_CODE:
			"The code you entered is invalid. Please check and try again.",
		TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE:
			"Too many attempts. Please request a new code.",
		ACCOUNT_TEMPORARILY_LOCKED:
			"Too many failed verification attempts. Your account is temporarily locked. Please try again later.",
		INVALID_TWO_FACTOR_COOKIE: "Invalid two factor cookie",
	};
