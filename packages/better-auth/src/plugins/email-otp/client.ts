import type { BetterAuthClientPlugin } from "@better-auth/core";
import type { emailOTP } from ".";

import { EMAIL_OTP_ERROR_CODES } from "./error-codes";

export * from "./error-codes";

export const emailOTPClient = () => {
	return {
		id: "email-otp",
		$InferServerPlugin: {} as ReturnType<typeof emailOTP>,
		atomListeners: [
			{
				matcher: (path) =>
					path === "/email-otp/verify-email" || path === "/sign-in/email-otp",
				signal: "$sessionSignal",
			},
		],
		$ERROR_CODES: EMAIL_OTP_ERROR_CODES,
	} satisfies BetterAuthClientPlugin;
};
