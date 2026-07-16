import type { TWO_FACTOR_ERROR_CODES } from "better-auth/plugins/two-factor";
import type { LocalizedTranslations } from "../../../types";

export const faTwoFactor: LocalizedTranslations<typeof TWO_FACTOR_ERROR_CODES> =
	{
		OTP_NOT_ENABLED: "OTP فعال نشده است",
		OTP_NOT_CONFIGURED: "OTP پیکربندی نشده است",
		OTP_HAS_EXPIRED: "OTP منقضی شده است",
		TOTP_NOT_ENABLED: "TOTP فعال نشده است",
		TOTP_NOT_CONFIGURED: "TOTP پیکربندی نشده است",
		TWO_FACTOR_NOT_ENABLED: "احراز هویت دو مرحله‌ای فعال نشده است",
		BACKUP_CODES_NOT_ENABLED: "کدهای پشتیبان فعال نشده‌اند",
		INVALID_BACKUP_CODE: "کد پشتیبان نامعتبر است یا قبلاً استفاده شده است.",
		INVALID_CODE:
			"کدی که وارد کردید نادرست است. لطفاً بررسی کنید و دوباره امتحان کنید.",
		TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE:
			"تلاش‌های زیادی انجام شده است. لطفاً یک کد جدید درخواست کنید.",
		ACCOUNT_TEMPORARILY_LOCKED:
			"تلاش‌های تأیید هویت زیادی ناموفق بوده است. حساب شما موقتاً قفل شده است. لطفاً بعداً دوباره امتحان کنید.",
		INVALID_TWO_FACTOR_COOKIE: "کوکی احراز هویت دو مرحله‌ای نامعتبر است",
	};
