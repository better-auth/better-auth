import type { BetterAuthClientPlugin } from "@better-auth/core";
import { PACKAGE_VERSION } from "../../version";
import type { MultiSessionPlugin } from ".";
import { MULTI_SESSION_ERROR_CODES } from "./error-codes";

export * from "./error-codes";

export const multiSessionClient = () => {
	return {
		id: "multi-session",
		version: PACKAGE_VERSION,
		$InferServerPlugin: {} as MultiSessionPlugin,
		atomListeners: [
			{
				matcher(path) {
					return path === "/multi-session/set-active";
				},
				signal: "$sessionSignal",
			},
		],
		$ERROR_CODES: MULTI_SESSION_ERROR_CODES,
	} satisfies BetterAuthClientPlugin;
};

export type { MultiSessionConfig, MultiSessionPlugin } from ".";
