import type { BetterAuthClientPlugin } from "@better-auth/core";
import { PACKAGE_VERSION } from "../../version.js";
import { EMAIL_OTP_ERROR_CODES } from "./error-codes.js";
import type { emailOTP } from "./index.js";

export * from "./error-codes.js";

export const emailOTPClient = () => {
	return {
		id: "email-otp",
		version: PACKAGE_VERSION,
		$InferServerPlugin: {} as ReturnType<typeof emailOTP>,
		atomListeners: [
			{
				matcher: (path) =>
					path === "/email-otp/verify-email" ||
					path === "/sign-in/email-otp" ||
					path === "/email-otp/request-email-change",
				signal: "$sessionSignal",
			},
		],
		$ERROR_CODES: EMAIL_OTP_ERROR_CODES,
	} satisfies BetterAuthClientPlugin;
};
