import type { ADMIN_ERROR_CODES } from "better-auth/plugins/admin";
import type { LocalizedTranslations } from "../../../types";

export const faAdmin: LocalizedTranslations<typeof ADMIN_ERROR_CODES> = {
	FAILED_TO_CREATE_USER: "خطا در ایجاد کاربر",
	USER_ALREADY_EXISTS: "کاربر از قبل وجود دارد.",
	USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
		"کاربر از قبل وجود دارد. از ایمیل دیگری استفاده کنید.",
	YOU_CANNOT_BAN_YOURSELF: "شما نمی‌توانید خودتان را مسدود کنید",
	YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE:
		"شما مجاز به تغییر نقش کاربران نیستید",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS: "شما مجاز به ایجاد کاربر نیستید",
	YOU_ARE_NOT_ALLOWED_TO_LIST_USERS: "شما مجاز به مشاهده لیست کاربران نیستید",
	YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS:
		"شما مجاز به مشاهده جلسات کاربران نیستید",
	YOU_ARE_NOT_ALLOWED_TO_BAN_USERS: "شما مجاز به مسدود کردن کاربران نیستید",
	YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS:
		"شما مجاز به انتحال هویت کاربران نیستید",
	YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS:
		"شما مجاز به ابطال جلسات کاربران نیستید",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS: "شما مجاز به حذف کاربران نیستید",
	YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD:
		"شما مجاز به تنظیم رمز عبور کاربران نیستید",
	BANNED_USER: "شما از این برنامه مسدود شده‌اید",
	YOU_ARE_NOT_ALLOWED_TO_GET_USER: "شما مجاز به دریافت اطلاعات کاربر نیستید",
	NO_DATA_TO_UPDATE: "داده‌ای برای به‌روزرسانی وجود ندارد",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS: "شما مجاز به به‌روزرسانی کاربران نیستید",
	YOU_CANNOT_REMOVE_YOURSELF: "شما نمی‌توانید خودتان را حذف کنید",
	YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE:
		"شما مجاز به تعیین مقدار نقش غیرموجود نیستید",
	YOU_CANNOT_IMPERSONATE_ADMINS: "شما نمی‌توانید هویت مدیران را انتحال کنید",
	INVALID_ROLE_TYPE: "نوع نقش نامعتبر است",
	YOU_ARE_NOT_ALLOWED_TO_SET_USERS_EMAIL:
		"شما مجاز به به‌روزرسانی ایمیل کاربران نیستید",
	PASSWORD_CANNOT_BE_UPDATED_VIA_UPDATE_USER:
		"رمز عبور از طریق به‌روزرسانی کاربر قابل به‌روزرسانی نیست. به جای آن از نقطه پایانی تنظیم رمز عبور کاربر استفاده کنید",
};
