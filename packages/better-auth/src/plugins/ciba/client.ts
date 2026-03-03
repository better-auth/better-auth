import type { BetterAuthClientPlugin } from "@better-auth/core";

export const cibaClient = () => {
	return {
		id: "ciba",
		$InferServerPlugin: {} as ReturnType<typeof import("./index").ciba>,
		pathMethods: {
			// Backchannel authorize - agent initiates auth request
			"/oauth/bc-authorize": "POST",
			// Verify - UI gets request details
			"/ciba/verify": "GET",
			// Authorize - user approves (requires session)
			"/ciba/authorize": "POST",
			// Reject - user rejects
			"/ciba/reject": "POST",
		},
	} satisfies BetterAuthClientPlugin;
};
