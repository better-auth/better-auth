import type { oneTimeToken } from "./index";
import type { BetterAuthClientPlugin } from "../../client/types";

export const oneTimeTokenClient = () => {
	return {
		id: "one-time-token",
		$InferServerPlugin: {} as ReturnType<typeof oneTimeToken>,
	} satisfies BetterAuthClientPlugin;
};
