import { lastLoginMethod } from ".";
import type { BetterAuthClientPlugin } from "../../types";

export const lastLoginMethodClient = () => {
	return {
		id: "last-login-method",
		$InferServerPlugin: {} as ReturnType<typeof lastLoginMethod>,
	} satisfies BetterAuthClientPlugin;
};
