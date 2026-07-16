import type { DEVICE_AUTHORIZATION_ERROR_CODES } from "better-auth/plugins/device-authorization";
import type { LocalizedTranslations } from "../../../types";

export const faDeviceAuthorization: LocalizedTranslations<
	typeof DEVICE_AUTHORIZATION_ERROR_CODES
> = {
	INVALID_DEVICE_CODE: "کد دستگاه نامعتبر است",
	EXPIRED_DEVICE_CODE: "کد دستگاه منقضی شده است",
	EXPIRED_USER_CODE: "کد کاربر منقضی شده است",
	AUTHORIZATION_PENDING: "مجوز در حال انتظار",
	ACCESS_DENIED: "دسترسی رد شد",
	INVALID_USER_CODE: "کد کاربر نامعتبر است",
	DEVICE_CODE_ALREADY_PROCESSED: "کد دستگاه قبلاً پردازش شده است",
	DEVICE_CODE_NOT_CLAIMED:
		"کد دستگاه توسط یک جلسه تأیید ادعا نشده است؛ لطفاً قبل از موافقت یا مخالفت، در حالت ورود به سیستم `GET /device` را با `user_code` فراخوانی کنید",
	POLLING_TOO_FREQUENTLY: "نظرسنجی بیش از حد معمول صورت می‌گیرد",
	USER_NOT_FOUND: "کاربر یافت نشد",
	FAILED_TO_CREATE_SESSION: "خطا در ایجاد جلسه",
	INVALID_DEVICE_CODE_STATUS: "وضعیت کد دستگاه نامعتبر است",
	AUTHENTICATION_REQUIRED: "احراز هویت الزامی است",
};
