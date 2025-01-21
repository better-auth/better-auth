import { EMAIL_OTP_ERROR_CODES, type emailOTP } from ".";
import type { BetterAuthClientPlugin } from "../../client/types";

export const emailOTPClient = () => {
	return {
		id: "email-otp",
		$InferServerPlugin: {} as ReturnType<typeof emailOTP>,
		$ERROR_CODES: EMAIL_OTP_ERROR_CODES,
	} satisfies BetterAuthClientPlugin;
};
