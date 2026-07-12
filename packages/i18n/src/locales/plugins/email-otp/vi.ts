import type { EMAIL_OTP_ERROR_CODES } from "better-auth/plugins/email-otp";
import type { LocalizedTranslations } from "../../../types";

export const viEmailOtp: LocalizedTranslations<typeof EMAIL_OTP_ERROR_CODES> = {
	OTP_EXPIRED: "OTP đã hết hạn",
	INVALID_OTP: "OTP không hợp lệ",
	TOO_MANY_ATTEMPTS: "Quá nhiều lần thử. Vui lòng thử lại sau.",
};
