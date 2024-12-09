import type { emailOTP } from ".";
import type { BetterAuthClientPlugin } from "../../client/types";

export const emailOTPClient = () => {
	return {
		id: "email-otp",
		$InferServerPlugin: {} as ReturnType<typeof emailOTP>,
		pathMethods: {
			"/sign-in/username": "POST",
		},
	} satisfies BetterAuthClientPlugin;
};
