import type { EMAIL_OTP_ERROR_CODES } from "better-auth/plugins/email-otp";
import type { LocalizedTranslations } from "../../../types";

export const plEmailOtp: LocalizedTranslations<typeof EMAIL_OTP_ERROR_CODES> = {
	OTP_EXPIRED: "OTP wygasł",
	INVALID_OTP: "Nieprawidłowy OTP",
	TOO_MANY_ATTEMPTS: "Zbyt wiele prób. Spróbuj ponownie później.",
};
