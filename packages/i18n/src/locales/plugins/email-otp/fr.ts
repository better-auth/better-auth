import type { EMAIL_OTP_ERROR_CODES } from "better-auth/plugins/email-otp";
import type { LocalizedTranslations } from "../../../types";

export const frEmailOtp: LocalizedTranslations<typeof EMAIL_OTP_ERROR_CODES> = {
	OTP_EXPIRED: "Le code OTP a expiré",
	INVALID_OTP: "Code OTP invalide",
	TOO_MANY_ATTEMPTS: "Trop de tentatives. Veuillez réessayer plus tard.",
};
