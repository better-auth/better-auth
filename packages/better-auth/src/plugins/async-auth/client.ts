import type { BetterAuthClientPlugin } from "@better-auth/core";

export const asyncAuthClient = () => {
	return {
		id: "async-auth",
		$InferServerPlugin: {} as ReturnType<typeof import("./index").asyncAuth>,
		pathMethods: {
			// Backchannel authorize - agent initiates auth request
			"/oauth/bc-authorize": "POST",
			// Verify - UI gets request details
			"/async-auth/verify": "GET",
			// Authorize - user approves (requires session)
			"/async-auth/authorize": "POST",
			// Reject - user rejects
			"/async-auth/reject": "POST",
		},
	} satisfies BetterAuthClientPlugin;
};
