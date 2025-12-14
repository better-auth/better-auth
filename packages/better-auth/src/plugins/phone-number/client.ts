import type { BetterAuthClientPlugin } from "@better-auth/core";
import type { phoneNumber } from ".";

export const phoneNumberClient = () => {
	return {
		id: "phoneNumber",
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
	} satisfies BetterAuthClientPlugin;
};

export type * from "./types";
