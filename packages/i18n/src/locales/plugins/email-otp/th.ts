import type { EMAIL_OTP_ERROR_CODES } from "better-auth/plugins/email-otp";
import type { LocalizedTranslations } from "../../../types";

export const thEmailOtp: LocalizedTranslations<typeof EMAIL_OTP_ERROR_CODES> = {
	OTP_EXPIRED: "OTP หมดอายุแล้ว",
	INVALID_OTP: "OTP ไม่ถูกต้อง",
	TOO_MANY_ATTEMPTS: "พยายามมากเกินไป กรุณาลองใหม่ในภายหลัง",
};
