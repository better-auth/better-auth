import type { emailOTP } from ".";
import type { BetterAuthClientPlugin } from "../../client/types";

// Options are only used for type inference
export const emailOTPClient = <CustomType extends string = never>(options?: {
	customTypes?: readonly CustomType[];
}) => {
	return {
		id: "email-otp",
		$InferServerPlugin: {} as ReturnType<
			typeof emailOTP<CustomType extends string ? CustomType : never>
		>,
	} satisfies BetterAuthClientPlugin;
};
