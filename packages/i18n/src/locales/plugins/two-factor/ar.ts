import type { TWO_FACTOR_ERROR_CODES } from "better-auth/plugins/two-factor";
import type { LocalizedTranslations } from "../../../types";

export const arTwoFactor: LocalizedTranslations<typeof TWO_FACTOR_ERROR_CODES> =
	{
		OTP_NOT_ENABLED: "رمز التحقق لمرة واحدة غير مفعل",
		OTP_NOT_CONFIGURED: "لم يتم تكوين رمز التحقق لمرة واحدة",
		OTP_HAS_EXPIRED: "انتهت صلاحية رمز التحقق لمرة واحدة",
		TOTP_NOT_ENABLED: "رمز التحقق TOTP غير مفعل",
		TOTP_NOT_CONFIGURED: "لم يتم تكوين رمز التحقق TOTP",
		TWO_FACTOR_NOT_ENABLED: "التحقق الثنائي غير مفعل",
		BACKUP_CODES_NOT_ENABLED: "رموز الاحتياط غير مفعّلة",
		INVALID_BACKUP_CODE: "الرمز الاحتياطي غير صالح أو تم استخدامه.",
		INVALID_CODE: "الرمز غير صحيح. تحقق وحاول مرة أخرى.",
		TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: "محاولات كثيرة جداً. يرجى طلب رمز جديد.",
		ACCOUNT_TEMPORARILY_LOCKED:
			"تم قفل هذا الحساب مؤقتاً. يرجى المحاولة مرة أخرى لاحقاً.",
		INVALID_TWO_FACTOR_COOKIE: "ملف تعريف ارتباط التحقق الثنائي غير صحيح",
	};
