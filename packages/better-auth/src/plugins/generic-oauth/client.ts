import type { genericOAuth } from ".";
import type { BetterAuthClientPlugin } from "../../types";

export const genericOAuthClient = () => {
	return {
		id: "generic-oauth-client",
		$InferServerPlugin: {} as ReturnType<typeof genericOAuth>,
		$ERROR_CODES: {
			INVALID_OAUTH_CONFIGURATION: "Invalid OAuth configuration",
		} as const,
	} satisfies BetterAuthClientPlugin;
};
