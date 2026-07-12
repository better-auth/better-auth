import type { EMAIL_OTP_ERROR_CODES } from "better-auth/plugins/email-otp";
import type { LocalizedTranslations } from "../../../types";

export const ukEmailOtp: LocalizedTranslations<typeof EMAIL_OTP_ERROR_CODES> = {
	OTP_EXPIRED: "OTP закінчився",
	INVALID_OTP: "Недійсний OTP",
	TOO_MANY_ATTEMPTS: "Забагато спроб. Будь ласка, спробуйте пізніше.",
};
