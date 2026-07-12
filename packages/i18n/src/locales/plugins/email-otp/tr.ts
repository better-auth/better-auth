import type { EMAIL_OTP_ERROR_CODES } from "better-auth/plugins/email-otp";
import type { LocalizedTranslations } from "../../../types";

export const trEmailOtp: LocalizedTranslations<typeof EMAIL_OTP_ERROR_CODES> = {
	OTP_EXPIRED: "OTP süresi doldu",
	INVALID_OTP: "Geçersiz OTP",
	TOO_MANY_ATTEMPTS: "Çok fazla deneme. Lütfen daha sonra tekrar deneyin.",
};
