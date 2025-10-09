import type { genericOAuth } from ".";
import type { BetterAuthClientPlugin } from "@better-auth/core";

export const genericOAuthClient = () => {
	return {
		id: "generic-oauth-client",
		$InferServerPlugin: {} as ReturnType<typeof genericOAuth>,
	} satisfies BetterAuthClientPlugin;
};
