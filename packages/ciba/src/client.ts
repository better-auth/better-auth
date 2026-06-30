import type { BetterAuthClientPlugin } from "@better-auth/core";
import type { ciba } from "./index";
import { PACKAGE_VERSION } from "./version";

/**
 * Client plugin for CIBA. Exposes the approval-page actions on the auth client:
 * `ciba.request()` (GET request details), `ciba.authorize()`, and
 * `ciba.reject()`. The agent-facing backchannel endpoint is a server-to-server
 * call and is not surfaced here.
 */
export const cibaClient = () => {
	return {
		id: "ciba",
		version: PACKAGE_VERSION,
		$InferServerPlugin: {} as ReturnType<typeof ciba>,
		pathMethods: {
			"/ciba/request": "GET",
		},
	} satisfies BetterAuthClientPlugin;
};
