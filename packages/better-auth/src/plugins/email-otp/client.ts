import type { BetterAuthClientPlugin } from "@better-auth/core";
import type { emailOTP } from ".";

export const emailOTPClient = () => {
	return {
		id: "email-otp",
		$InferServerPlugin: {} as ReturnType<typeof emailOTP>,
		atomListeners: [
			{
				matcher: (path) => path === "/email-otp/verify-email",
				signal: "$sessionSignal",
			},
		],
	} satisfies BetterAuthClientPlugin;
};
