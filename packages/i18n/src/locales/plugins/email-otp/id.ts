import type { EMAIL_OTP_ERROR_CODES } from "better-auth/plugins/email-otp";
import type { LocalizedTranslations } from "../../../types";

export const idEmailOtp: LocalizedTranslations<typeof EMAIL_OTP_ERROR_CODES> = {
	OTP_EXPIRED: "OTP telah kedaluwarsa",
	INVALID_OTP: "OTP tidak valid",
	TOO_MANY_ATTEMPTS: "Terlalu banyak percobaan. Silakan coba lagi nanti.",
};
