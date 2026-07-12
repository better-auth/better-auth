import type { PASSKEY_ERROR_CODES } from "@better-auth/passkey";
import type { LocalizedTranslations } from "../../../types";

export const faPasskey: LocalizedTranslations<typeof PASSKEY_ERROR_CODES> = {
	CHALLENGE_NOT_FOUND: "چالش یافت نشد",
	YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY:
		"شما مجاز به ثبت این کلید عبور نیستید",
	FAILED_TO_VERIFY_REGISTRATION: "تایید ثبت نام ناموفق بود",
	PASSKEY_NOT_FOUND: "کلید عبور یافت نشد",
	AUTHENTICATION_FAILED: "احراز هویت ناموفق بود",
	UNABLE_TO_CREATE_SESSION: "امکان ایجاد نشست وجود ندارد",
	FAILED_TO_UPDATE_PASSKEY: "بروزرسانی کلید عبور ناموفق بود",
	PREVIOUSLY_REGISTERED: "قبلا ثبت شده است",
	REGISTRATION_CANCELLED: "ثبت نام لغو شد",
	AUTH_CANCELLED: "احراز هویت لغو شد",
	UNKNOWN_ERROR: "خطای ناشناخته رخ داد",
	SESSION_REQUIRED: "ثبت کلید عبور نیاز به یک نشست احراز هویت شده دارد",
	RESOLVE_USER_REQUIRED:
		"ثبت کلید عبور نیاز به یک نشست احراز هویت شده یا یک تابع بازخورد resolveUser دارد زمانی که requireSession نادرست است",
	RESOLVED_USER_INVALID: "کاربر حل شده نامعتبر است",
};
