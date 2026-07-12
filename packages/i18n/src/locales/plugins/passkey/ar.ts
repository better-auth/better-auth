import type { PASSKEY_ERROR_CODES } from "@better-auth/passkey";
import type { LocalizedTranslations } from "../../../types";

export const arPasskey: LocalizedTranslations<typeof PASSKEY_ERROR_CODES> = {
	CHALLENGE_NOT_FOUND: "التحدي غير موجود",
	YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY:
		"غير مسموح لك بتسجيل مفتاح المرور هذا",
	FAILED_TO_VERIFY_REGISTRATION: "فشل التحقق من التسجيل",
	PASSKEY_NOT_FOUND: "مفتاح المرور غير موجود",
	AUTHENTICATION_FAILED: "فشلت عملية المصادقة",
	UNABLE_TO_CREATE_SESSION: "غير قادر على إنشاء الجلسة",
	FAILED_TO_UPDATE_PASSKEY: "فشل تحديث مفتاح المرور",
	PREVIOUSLY_REGISTERED: "مسجل مسبقًا",
	REGISTRATION_CANCELLED: "تم إلغاء التسجيل",
	AUTH_CANCELLED: "تم إلغاء المصادقة",
	UNKNOWN_ERROR: "حدث خطأ غير معروف",
	SESSION_REQUIRED: "يتطلب تسجيل مفتاح المرور جلسة مصادقة",
	RESOLVE_USER_REQUIRED:
		"يتطلب تسجيل مفتاح المرور إما جلسة مصادقة أو دالة استدعاء resolveUser عند تعيين requireSession إلى false",
	RESOLVED_USER_INVALID: "المستخدم الذي تم حله غير صالح",
};
