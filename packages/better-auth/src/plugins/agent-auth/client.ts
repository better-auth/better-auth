import type { BetterAuthClientPlugin } from "@better-auth/core";
import type { agentAuth } from ".";

export const agentAuthClient = () => {
	return {
		id: "agent-auth",
		$InferServerPlugin: {} as ReturnType<typeof agentAuth>,
		pathMethods: {
			// Background auth (CIBA)
			"/oauth/bc-authorize": "POST",
			"/ciba/verify": "GET",
			"/ciba/authorize": "POST",
			"/ciba/reject": "POST",
		},
	} satisfies BetterAuthClientPlugin;
};
