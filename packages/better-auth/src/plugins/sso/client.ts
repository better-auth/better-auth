import type { sso } from ".";
import type { BetterAuthClientPlugin } from "@better-auth/core";

export const ssoClient = () => {
	return {
		id: "sso-client",
		$InferServerPlugin: {} as ReturnType<typeof sso>,
	} satisfies BetterAuthClientPlugin;
};
