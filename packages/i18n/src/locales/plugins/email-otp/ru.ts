import type { EMAIL_OTP_ERROR_CODES } from "better-auth/plugins/email-otp";
import type { LocalizedTranslations } from "../../../types";

export const ruEmailOtp: LocalizedTranslations<typeof EMAIL_OTP_ERROR_CODES> = {
	OTP_EXPIRED: "OTP истёк",
	INVALID_OTP: "Неверный OTP",
	TOO_MANY_ATTEMPTS: "Слишком много попыток. Попробуйте позже.",
};
