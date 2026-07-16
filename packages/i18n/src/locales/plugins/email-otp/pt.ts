import type { EMAIL_OTP_ERROR_CODES } from "better-auth/plugins/email-otp";
import type { LocalizedTranslations } from "../../../types";

export const ptEmailOtp: LocalizedTranslations<typeof EMAIL_OTP_ERROR_CODES> = {
	OTP_EXPIRED: "OTP expirou",
	INVALID_OTP: "OTP inválido",
	TOO_MANY_ATTEMPTS:
		"Tentativas demais. Por favor, tente novamente mais tarde.",
};
