import type { EMAIL_OTP_ERROR_CODES } from "better-auth/plugins/email-otp";
import type { LocalizedTranslations } from "../../../types";

export const esEmailOtp: LocalizedTranslations<typeof EMAIL_OTP_ERROR_CODES> = {
	OTP_EXPIRED: "OTP expirado",
	INVALID_OTP: "OTP inválido",
	TOO_MANY_ATTEMPTS: "Demasiados intentos. Por favor, intenta más tarde.",
};
