import type { TranslationDictionary } from "../types";

/**
 * Arabic translations
 */
export const ar: TranslationDictionary = {
	USER_NOT_FOUND: "المستخدم غير موجود",
	FAILED_TO_CREATE_USER: "فشل في إنشاء المستخدم",
	FAILED_TO_CREATE_SESSION: "فشل في إنشاء الجلسة",
	FAILED_TO_UPDATE_USER: "فشل في تحديث المستخدم",
	FAILED_TO_GET_SESSION: "فشل في الحصول على الجلسة",
	INVALID_PASSWORD: "كلمة المرور غير صالحة",
	INVALID_EMAIL: "البريد الإلكتروني غير صالح",
	INVALID_EMAIL_OR_PASSWORD: "البريد الإلكتروني أو كلمة المرور غير صالحة",
	INVALID_USER: "مستخدم غير صالح",
	SOCIAL_ACCOUNT_ALREADY_LINKED: "الحساب الاجتماعي مرتبط بالفعل",
	PROVIDER_NOT_FOUND: "مزود الخدمة غير موجود",
	INVALID_TOKEN: "الرمز المميز غير صالح",
	TOKEN_EXPIRED: "انتهت صلاحية الرمز المميز",
	FAILED_TO_GET_USER_INFO: "فشل في الحصول على معلومات المستخدم",
	USER_EMAIL_NOT_FOUND: "بريد المستخدم الإلكتروني غير موجود",
	EMAIL_NOT_VERIFIED: "البريد الإلكتروني غير مُحقق",
	PASSWORD_TOO_SHORT: "كلمة المرور قصيرة جداً",
	PASSWORD_TOO_LONG: "كلمة المرور طويلة جداً",
	USER_ALREADY_EXISTS: "المستخدم موجود بالفعل",
	USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
		"المستخدم موجود بالفعل. استخدم بريداً إلكترونياً آخر.",
	EMAIL_CAN_NOT_BE_UPDATED: "لا يمكن تحديث البريد الإلكتروني",
	CREDENTIAL_ACCOUNT_NOT_FOUND: "حساب بيانات الاعتماد غير موجود",
	SESSION_EXPIRED: "انتهت الجلسة. أعد المصادقة لتنفيذ هذا الإجراء.",
	FAILED_TO_UNLINK_LAST_ACCOUNT: "لا يمكنك إلغاء ربط حسابك الأخير",
	ACCOUNT_NOT_FOUND: "الحساب غير موجود",
	USER_ALREADY_HAS_PASSWORD:
		"المستخدم لديه كلمة مرور بالفعل. قدمها لحذف الحساب.",
	VERIFICATION_EMAIL_NOT_ENABLED: "بريد التحقق غير مفعّل",
	EMAIL_ALREADY_VERIFIED: "البريد الإلكتروني مُحقق بالفعل",
	EMAIL_MISMATCH: "البريد الإلكتروني غير متطابق",
	SESSION_NOT_FRESH: "الجلسة ليست حديثة",
	LINKED_ACCOUNT_ALREADY_EXISTS: "الحساب المرتبط موجود بالفعل",
	VALIDATION_ERROR: "خطأ في التحقق",
	MISSING_FIELD: "هذا الحقل مطلوب",
	PASSWORD_ALREADY_SET: "المستخدم لديه كلمة مرور محددة بالفعل",
};
