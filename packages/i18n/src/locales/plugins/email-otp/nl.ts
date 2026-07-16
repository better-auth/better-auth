import type { EMAIL_OTP_ERROR_CODES } from "better-auth/plugins/email-otp";
import type { LocalizedTranslations } from "../../../types";

export const nlEmailOtp: LocalizedTranslations<typeof EMAIL_OTP_ERROR_CODES> = {
	OTP_EXPIRED: "OTP is verlopen",
	INVALID_OTP: "Ongeldige OTP",
	TOO_MANY_ATTEMPTS: "Te veel pogingen. Probeer het later opnieuw.",
};
