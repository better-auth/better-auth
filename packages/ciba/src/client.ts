import type { BetterAuthClientPlugin } from "@better-auth/core";
import type { ciba } from "./index";
import { PACKAGE_VERSION } from "./version";

/**
 * Client plugin for CIBA approval UIs: `ciba.requests()`, `ciba.request()`,
 * `ciba.approve()`, and `ciba.deny()`. The backchannel endpoint is a
 * server-to-server call and is not exposed here.
 */
export const cibaClient = () => {
	return {
		id: "ciba",
		version: PACKAGE_VERSION,
		$InferServerPlugin: {} as ReturnType<typeof ciba>,
		pathMethods: {
			"/ciba/request": "GET",
			"/ciba/requests": "GET",
		},
	} satisfies BetterAuthClientPlugin;
};
