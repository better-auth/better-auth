import type { USERNAME_ERROR_CODES } from "better-auth/plugins/username";
import type { LocalizedTranslations } from "../../../types";

export const faUsername: LocalizedTranslations<typeof USERNAME_ERROR_CODES> = {
	INVALID_USERNAME_OR_PASSWORD: "نام کاربری یا رمز عبور نامعتبر است",
	EMAIL_NOT_VERIFIED: "ایمیل تأیید نشده است",
	UNEXPECTED_ERROR: "خطای غیرمنتظره",
	USERNAME_IS_ALREADY_TAKEN:
		"نام کاربری قبلاً گرفته شده است. لطفاً نام دیگری را امتحان کنید.",
	USERNAME_TOO_SHORT: "نام کاربری خیلی کوتاه است",
	USERNAME_TOO_LONG: "نام کاربری خیلی طولانی است",
	INVALID_USERNAME: "نام کاربری نامعتبر است",
	INVALID_DISPLAY_USERNAME: "نام نمایشی نامعتبر است",
	USERNAME_IS_IMMUTABLE: "نام کاربری قابل به‌روزرسانی نیست",
};
