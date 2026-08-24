import type { BetterAuthClientPlugin } from "@better-auth/core";
import type { refreshableSession } from ".";
import { REFRESHABLE_SESSION_ERROR_CODES } from "./error-codes";
import { PACKAGE_VERSION } from "./version";

export { REFRESHABLE_SESSION_ERROR_CODES } from "./error-codes";

/** Client plugin for the refreshable-session server plugin. */
export const refreshableSessionClient = () => {
	return {
		id: "refreshable-session",
		version: PACKAGE_VERSION,
		$InferServerPlugin: {} as ReturnType<typeof refreshableSession>,
		pathMethods: {
			"/refresh-session": "POST",
			"/revoke-refresh-session": "POST",
		},
		atomListeners: [
			{
				matcher: (path) => path === "/refresh-session",
				signal: "$sessionSignal",
			},
			{
				matcher: (path) => path === "/revoke-refresh-session",
				signal: "$sessionSignal",
			},
		],
		$ERROR_CODES: REFRESHABLE_SESSION_ERROR_CODES,
	} satisfies BetterAuthClientPlugin;
};

export type RefreshableSessionClientPlugin = ReturnType<
	typeof refreshableSessionClient
>;

export type * from "./types";
