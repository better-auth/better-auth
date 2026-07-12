import type { ANONYMOUS_ERROR_CODES } from "better-auth/plugins/anonymous";
import type { LocalizedTranslations } from "../../../types";

export const arAnonymous: LocalizedTranslations<typeof ANONYMOUS_ERROR_CODES> =
	{
		INVALID_EMAIL_FORMAT: "لم يتم إنشاء البريد الإلكتروني بتنسيق صالح",
		FAILED_TO_CREATE_USER: "فشل في إنشاء المستخدم",
		COULD_NOT_CREATE_SESSION: "تعذر إنشاء الجلسة",
		ANONYMOUS_USERS_CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY:
			"لا يمكن للمستخدمين المجهولين تسجيل الدخول بشكل مجهول مرة أخرى",
		FAILED_TO_DELETE_ANONYMOUS_USER: "فشل حذف المستخدم المجهول",
		FAILED_TO_DELETE_ANONYMOUS_USER_SESSIONS: "فشل حذف جلسات المستخدم المجهول",
		USER_IS_NOT_ANONYMOUS: "المستخدم ليس مجهول الهوية",
		DELETE_ANONYMOUS_USER_DISABLED: "حذف المستخدمين المجهولين معطل",
	};
