import type { loginHistory } from ".";
import type { BetterAuthClientPlugin } from "../../client/types";

export const loginHistoryClient = () => {
	return {
		id: "login-history",
		$InferServerPlugin: {} as ReturnType<typeof loginHistory>,
		pathMethods: {
			"/login-history/list": "GET",
		},
	} satisfies BetterAuthClientPlugin;
};
