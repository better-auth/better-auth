import type { EMAIL_OTP_ERROR_CODES } from "better-auth/plugins/email-otp";
import type { LocalizedTranslations } from "../../../types";

export const hiEmailOtp: LocalizedTranslations<typeof EMAIL_OTP_ERROR_CODES> = {
	OTP_EXPIRED: "OTP समाप्त हो गया है",
	INVALID_OTP: "अमान्य OTP",
	TOO_MANY_ATTEMPTS: "बहुत अधिक प्रयास। कृपया बाद में पुनः प्रयास करें।",
};
