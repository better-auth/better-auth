import type { oneTimeToken } from "./index";
import type { BetterAuthClientPlugin } from "../../types";

export const oneTimeTokenClient = () => {
	return {
		id: "better-auth-client",
		$InferServerPlugin: {} as ReturnType<typeof oneTimeToken>,
	} satisfies BetterAuthClientPlugin;
};
