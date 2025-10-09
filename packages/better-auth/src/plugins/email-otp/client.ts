import type { emailOTP } from ".";
import type { BetterAuthClientPlugin } from "@better-auth/core";

export const emailOTPClient = () => {
	return {
		id: "email-otp",
		$InferServerPlugin: {} as ReturnType<typeof emailOTP>,
	} satisfies BetterAuthClientPlugin;
};
