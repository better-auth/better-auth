import type { PHONE_NUMBER_ERROR_CODES } from "better-auth/plugins/phone-number";
import type { LocalizedTranslations } from "../../../types";

export const faPhoneNumber: LocalizedTranslations<
	typeof PHONE_NUMBER_ERROR_CODES
> = {
	INVALID_PHONE_NUMBER: "شماره تلفن نامعتبر است",
	PHONE_NUMBER_EXIST: "شماره تلفن از قبل وجود دارد",
	PHONE_NUMBER_NOT_EXIST: "شماره تلفن ثبت نشده است",
	INVALID_PHONE_NUMBER_OR_PASSWORD: "شماره تلفن یا رمز عبور نامعتبر است",
	UNEXPECTED_ERROR: "خطای غیرمنتظره‌ای رخ داد",
	OTP_NOT_FOUND: "OTP یافت نشد",
	OTP_EXPIRED: "OTP منقضی شده است",
	INVALID_OTP: "OTP نامعتبر است",
	PHONE_NUMBER_NOT_VERIFIED: "شماره تلفن تأیید نشده است",
	PHONE_NUMBER_CANNOT_BE_UPDATED: "شماره تلفن قابل به‌روزرسانی نیست",
	SEND_OTP_NOT_IMPLEMENTED: "sendOTP پیاده‌سازی نشده است",
	TOO_MANY_ATTEMPTS:
		"تلاش‌های زیادی انجام شده است. لطفاً بعداً دوباره امتحان کنید.",
};
