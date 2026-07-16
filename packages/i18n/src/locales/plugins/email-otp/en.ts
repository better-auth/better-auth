import type { EMAIL_OTP_ERROR_CODES } from "better-auth/plugins/email-otp";
import type { LocalizedTranslations } from "../../../types";

export const enEmailOtp: LocalizedTranslations<typeof EMAIL_OTP_ERROR_CODES> = {
	OTP_EXPIRED: "OTP expired",
	INVALID_OTP: "Invalid OTP",
	TOO_MANY_ATTEMPTS: "Too many attempts",
};
