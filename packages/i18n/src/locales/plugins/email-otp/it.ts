import type { EMAIL_OTP_ERROR_CODES } from "better-auth/plugins/email-otp";
import type { LocalizedTranslations } from "../../../types";

export const itEmailOtp: LocalizedTranslations<typeof EMAIL_OTP_ERROR_CODES> = {
	OTP_EXPIRED: "OTP scaduto",
	INVALID_OTP: "OTP non valido",
	TOO_MANY_ATTEMPTS: "Troppi tentativi. Riprova più tardi.",
};
