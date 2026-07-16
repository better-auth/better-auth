import type { EMAIL_OTP_ERROR_CODES } from "better-auth/plugins/email-otp";
import type { LocalizedTranslations } from "../../../types";

export const jaEmailOtp: LocalizedTranslations<typeof EMAIL_OTP_ERROR_CODES> = {
	OTP_EXPIRED: "OTPの有効期限が切れました",
	INVALID_OTP: "無効なOTPです",
	TOO_MANY_ATTEMPTS:
		"試行回数が多すぎます。しばらく後でもう一度お試しください。",
};
