import type { BetterAuthClientPlugin } from "@better-auth/core";
import type { loginAliasPlugin } from "./index";

export const loginAliasClient = () => {
	return {
		id: "login-alias",
		$InferServerPlugin: {} as ReturnType<typeof loginAliasPlugin>,
		pathMethods: {
			"/alias/list": "GET",
			"/alias/add": "POST",
			"/alias/remove": "POST",
			"/alias/make-primary": "POST",
			"/alias/verify": "POST",
			"/alias/find-user": "POST",
		},
	} satisfies BetterAuthClientPlugin;
};
