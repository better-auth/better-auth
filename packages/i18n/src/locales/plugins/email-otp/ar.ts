import type { EMAIL_OTP_ERROR_CODES } from "better-auth/plugins/email-otp";
import type { LocalizedTranslations } from "../../../types";

export const arEmailOtp: LocalizedTranslations<typeof EMAIL_OTP_ERROR_CODES> = {
	OTP_EXPIRED: "انتهت صلاحية رمز OTP",
	INVALID_OTP: "رمز OTP غير صالح",
	TOO_MANY_ATTEMPTS: "محاولات كثيرة جداً. يرجى المحاولة مرة أخرى لاحقاً.",
};
