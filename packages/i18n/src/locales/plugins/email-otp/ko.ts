import type { EMAIL_OTP_ERROR_CODES } from "better-auth/plugins/email-otp";
import type { LocalizedTranslations } from "../../../types";

export const koEmailOtp: LocalizedTranslations<typeof EMAIL_OTP_ERROR_CODES> = {
	OTP_EXPIRED: "OTP가 만료되었습니다",
	INVALID_OTP: "유효하지 않은 OTP입니다",
	TOO_MANY_ATTEMPTS: "시도 횟수가 너무 많습니다. 나중에 다시 시도하세요.",
};
