import type { BetterAuthClientPlugin } from "@better-auth/core";
import type { genericOAuth } from ".";

export const genericOAuthClient = () => {
	return {
		id: "generic-oauth-client",
		$InferServerPlugin: {} as ReturnType<typeof genericOAuth>,
	} satisfies BetterAuthClientPlugin;
};
