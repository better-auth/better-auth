import type { BetterAuthClientPlugin } from "@better-auth/core";
import { PACKAGE_VERSION } from "../../version";
import type { phoneNumber } from ".";
import { PHONE_NUMBER_ERROR_CODES } from "./error-codes";

export * from "./error-codes";

export const phoneNumberClient = () => {
	return {
		id: "phoneNumber",
		version: PACKAGE_VERSION,
		$InferServerPlugin: {} as ReturnType<typeof phoneNumber>,
		atomListeners: [
			{
				matcher(path) {
					return (
						path === "/phone-number/update" ||
						path === "/phone-number/verify" ||
						path === "/sign-in/phone-number"
					);
				},
				signal: "$sessionSignal",
			},
		],
		$ERROR_CODES: PHONE_NUMBER_ERROR_CODES,
	} satisfies BetterAuthClientPlugin;
};

export type * from "./types";
