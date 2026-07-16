import type { ADMIN_ERROR_CODES } from "better-auth/plugins/admin";
import type { LocalizedTranslations } from "../../../types";

export const arAdmin: LocalizedTranslations<typeof ADMIN_ERROR_CODES> = {
	FAILED_TO_CREATE_USER: "فشل في إنشاء المستخدم",
	USER_ALREADY_EXISTS: "المستخدم موجود بالفعل.",
	USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
		"المستخدم موجود بالفعل. استخدم بريدًا إلكترونيًا آخر.",
	YOU_CANNOT_BAN_YOURSELF: "لا يمكنك حظر نفسك",
	YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE:
		"غير مسموح لك بتغيير دور المستخدمين",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS: "غير مسموح لك بإنشاء مستخدمين",
	YOU_ARE_NOT_ALLOWED_TO_LIST_USERS: "غير مسموح لك بعرض قائمة المستخدمين",
	YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS:
		"غير مسموح لك بعرض جلسات المستخدمين",
	YOU_ARE_NOT_ALLOWED_TO_BAN_USERS: "غير مسموح لك بحظر المستخدمين",
	YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS:
		"غير مسموح لك بانتحال صفة المستخدمين",
	YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS:
		"غير مسموح لك بإلغاء جلسات المستخدمين",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS: "غير مسموح لك بحذف المستخدمين",
	YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD:
		"غير مسموح لك بتعيين كلمة مرور المستخدمين",
	BANNED_USER: "لقد تم حظرك من هذا التطبيق",
	YOU_ARE_NOT_ALLOWED_TO_GET_USER: "غير مسموح لك بالحصول على بيانات المستخدم",
	NO_DATA_TO_UPDATE: "لا توجد بيانات لتحديثها",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS: "غير مسموح لك بتحديث المستخدمين",
	YOU_CANNOT_REMOVE_YOURSELF: "لا يمكنك إزالة نفسك",
	YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE:
		"غير مسموح لك بتعيين قيمة دور غير موجودة",
	YOU_CANNOT_IMPERSONATE_ADMINS: "لا يمكنك انتحال صفة المسؤولين",
	INVALID_ROLE_TYPE: "نوع الدور غير صالح",
	YOU_ARE_NOT_ALLOWED_TO_SET_USERS_EMAIL:
		"غير مسموح لك بتحديث البريد الإلكتروني للمستخدمين",
	PASSWORD_CANNOT_BE_UPDATED_VIA_UPDATE_USER:
		"لا يمكن تحديث كلمة المرور عبر تحديث المستخدم. استخدم نقطة نهاية تعيين كلمة مرور المستخدم بدلاً من ذلك",
};
