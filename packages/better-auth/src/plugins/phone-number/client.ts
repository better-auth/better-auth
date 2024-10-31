import type { phoneNumber } from ".";
import type { BetterAuthClientPlugin } from "../../client/types";

export const phoneNumberClient = () => {
	return {
		id: "phoneNumber",
		$InferServerPlugin: {} as ReturnType<typeof phoneNumber>,
		atomListeners: [
			{
				matcher(path) {
					return (
						path === "/phone-number/update" || path === "/phone-number/verify"
					);
				},
				signal: "$sessionSignal",
			},
		],
	} satisfies BetterAuthClientPlugin;
};
