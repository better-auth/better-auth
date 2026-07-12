import type { EMAIL_OTP_ERROR_CODES } from "better-auth/plugins/email-otp";
import type { LocalizedTranslations } from "../../../types";

export const bnEmailOtp: LocalizedTranslations<typeof EMAIL_OTP_ERROR_CODES> = {
	OTP_EXPIRED: "OTP মেয়াদ শেষ হয়ে গেছে",
	INVALID_OTP: "অবৈধ OTP",
	TOO_MANY_ATTEMPTS: "অনেক বেশি চেষ্টা হয়েছে। পরে আবার চেষ্টা করুন।",
};
