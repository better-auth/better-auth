import type { EMAIL_OTP_ERROR_CODES } from "better-auth/plugins/email-otp";
import type { LocalizedTranslations } from "../../../types";

export const faEmailOtp: LocalizedTranslations<typeof EMAIL_OTP_ERROR_CODES> = {
	OTP_EXPIRED: "OTP منقضی شده است",
	INVALID_OTP: "OTP نامعتبر است",
	TOO_MANY_ATTEMPTS:
		"تلاش‌های زیادی انجام شده است. لطفاً بعداً دوباره امتحان کنید.",
};
