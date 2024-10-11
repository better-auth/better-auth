import type { genericOAuth } from ".";
import type { BetterAuthClientPlugin } from "../../types";

export const genericOAuthClient = () => {
	return {
		id: "generic-oauth-client",
		$InferServerPlugin: {} as ReturnType<typeof genericOAuth>,
	} satisfies BetterAuthClientPlugin;
};
