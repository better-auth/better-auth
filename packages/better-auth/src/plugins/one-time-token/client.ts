import type { BetterAuthClientPlugin } from "@better-auth/core";
import { PACKAGE_VERSION } from "../../version";
import type { oneTimeToken } from "./index";

export const oneTimeTokenClient = () => {
	return {
		id: "one-time-token",
		version: PACKAGE_VERSION,
		$InferServerPlugin: {} as ReturnType<typeof oneTimeToken>,
		atomListeners: [
			{
				matcher: (path) => path === "/one-time-token/verify",
				signal: "$sessionSignal",
			},
		],
	} satisfies BetterAuthClientPlugin;
};

export type { OneTimeTokenOptions } from "./index";
