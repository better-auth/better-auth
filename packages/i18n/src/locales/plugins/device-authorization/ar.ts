import type { DEVICE_AUTHORIZATION_ERROR_CODES } from "better-auth/plugins/device-authorization";
import type { LocalizedTranslations } from "../../../types";

export const arDeviceAuthorization: LocalizedTranslations<
	typeof DEVICE_AUTHORIZATION_ERROR_CODES
> = {
	INVALID_DEVICE_CODE: "رمز الجهاز غير صالح",
	EXPIRED_DEVICE_CODE: "انتهت صلاحية رمز الجهاز",
	EXPIRED_USER_CODE: "انتهت صلاحية رمز المستخدم",
	AUTHORIZATION_PENDING: "التفويض معلق",
	ACCESS_DENIED: "تم رفض الوصول",
	INVALID_USER_CODE: "رمز المستخدم غير صالح",
	DEVICE_CODE_ALREADY_PROCESSED: "تمت معالجة رمز الجهاز بالفعل",
	DEVICE_CODE_NOT_CLAIMED:
		"لم يتم تحديد رمز الجهاز بواسطة جلسة تحقق؛ يرجى استدعاء `GET /device` مع `user_code` أثناء تسجيل الدخول قبل الموافقة أو الرفض",
	POLLING_TOO_FREQUENTLY: "الاستعلام متكرر للغاية",
	USER_NOT_FOUND: "المستخدم غير موجود",
	FAILED_TO_CREATE_SESSION: "فشل في إنشاء الجلسة",
	INVALID_DEVICE_CODE_STATUS: "حالة رمز الجهاز غير صالحة",
	AUTHENTICATION_REQUIRED: "المصادقة مطلوبة",
};
