import type { ANONYMOUS_ERROR_CODES } from "better-auth/plugins/anonymous";
import type { LocalizedTranslations } from "../../../types";

export const faAnonymous: LocalizedTranslations<typeof ANONYMOUS_ERROR_CODES> =
	{
		INVALID_EMAIL_FORMAT: "ایمیل در قالب معتبری ایجاد نشده است",
		FAILED_TO_CREATE_USER: "خطا در ایجاد کاربر",
		COULD_NOT_CREATE_SESSION: "امکان ایجاد جلسه وجود نداشت",
		ANONYMOUS_USERS_CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY:
			"کاربران ناشناس نمی‌توانند دوباره به صورت ناشناس وارد شوند",
		FAILED_TO_DELETE_ANONYMOUS_USER: "خطا در حذف کاربر ناشناس",
		FAILED_TO_DELETE_ANONYMOUS_USER_SESSIONS: "خطا در حذف جلسات کاربر ناشناس",
		USER_IS_NOT_ANONYMOUS: "کاربر ناشناس نیست",
		DELETE_ANONYMOUS_USER_DISABLED: "حذف کاربران ناشناس غیرفعال است",
	};
