import type { phoneNumber } from ".";
import type { BetterAuthClientPlugin } from "../../client/types";

export const phoneNumberClient = () => {
	return {
		id: "phoneNumber",
		$InferServerPlugin: {} as ReturnType<typeof phoneNumber>,
	} satisfies BetterAuthClientPlugin;
};
