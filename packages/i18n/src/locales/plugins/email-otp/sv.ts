import type { EMAIL_OTP_ERROR_CODES } from "better-auth/plugins/email-otp";
import type { LocalizedTranslations } from "../../../types";

export const svEmailOtp: LocalizedTranslations<typeof EMAIL_OTP_ERROR_CODES> = {
	OTP_EXPIRED: "OTP har gått ut",
	INVALID_OTP: "Ogiltig OTP",
	TOO_MANY_ATTEMPTS: "För många försök. Försök igen senare.",
};
