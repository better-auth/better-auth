import type { EMAIL_OTP_ERROR_CODES } from "better-auth/plugins/email-otp";
import type { LocalizedTranslations } from "../../../types";

export const deEmailOtp: LocalizedTranslations<typeof EMAIL_OTP_ERROR_CODES> = {
	OTP_EXPIRED: "OTP ist abgelaufen",
	INVALID_OTP: "Ungültiges OTP",
	TOO_MANY_ATTEMPTS:
		"Zu viele Versuche. Bitte versuchen Sie es später noch einmal.",
};
