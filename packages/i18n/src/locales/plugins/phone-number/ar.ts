import type { PHONE_NUMBER_ERROR_CODES } from "better-auth/plugins/phone-number";
import type { LocalizedTranslations } from "../../../types";

export const arPhoneNumber: LocalizedTranslations<
	typeof PHONE_NUMBER_ERROR_CODES
> = {
	INVALID_PHONE_NUMBER: "رقم الهاتف غير صالح",
	PHONE_NUMBER_EXIST: "رقم الهاتف موجود بالفعل",
	PHONE_NUMBER_NOT_EXIST: "رقم الهاتف غير مسجل",
	INVALID_PHONE_NUMBER_OR_PASSWORD: "رقم الهاتف أو كلمة المرور غير صحيحة",
	UNEXPECTED_ERROR: "حدث خطأ غير متوقع",
	OTP_NOT_FOUND: "لم يتم العثور على رمز OTP",
	OTP_EXPIRED: "انتهت صلاحية رمز OTP",
	INVALID_OTP: "رمز OTP غير صالح",
	PHONE_NUMBER_NOT_VERIFIED: "رقم الهاتف غير مُتحقق منه",
	PHONE_NUMBER_CANNOT_BE_UPDATED: "لا يمكن تحديث رقم الهاتف",
	SEND_OTP_NOT_IMPLEMENTED: "إرسال OTP غير مُطبَّق",
	TOO_MANY_ATTEMPTS: "محاولات كثيرة جداً. يرجى المحاولة مرة أخرى لاحقاً.",
};
