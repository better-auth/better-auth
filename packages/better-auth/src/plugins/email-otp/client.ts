import type { BetterAuthClientPlugin } from "@better-auth/core";
import type { emailOTP } from ".";

export const emailOTPClient = () => {
	return {
		id: "email-otp",
		$InferServerPlugin: {} as ReturnType<typeof emailOTP>,
	} satisfies BetterAuthClientPlugin;
};
