import type { BetterAuthClientPlugin } from "@better-auth/core";
import type { sso } from ".";

export const ssoClient = () => {
	return {
		id: "sso-client",
		$InferServerPlugin: {} as ReturnType<typeof sso>,
	} satisfies BetterAuthClientPlugin;
};
