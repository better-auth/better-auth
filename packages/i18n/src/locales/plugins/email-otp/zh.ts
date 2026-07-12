import type { EMAIL_OTP_ERROR_CODES } from "better-auth/plugins/email-otp";
import type { LocalizedTranslations } from "../../../types";

export const zhEmailOtp: LocalizedTranslations<typeof EMAIL_OTP_ERROR_CODES> = {
	OTP_EXPIRED: "验证码已过期",
	INVALID_OTP: "验证码无效",
	TOO_MANY_ATTEMPTS: "尝试次数过多，请稍后再试。",
};
