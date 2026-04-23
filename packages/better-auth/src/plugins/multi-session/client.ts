import type { BetterAuthClientPlugin } from "@better-auth/core";
import { PACKAGE_VERSION } from "../../version.js";
import { MULTI_SESSION_ERROR_CODES } from "./error-codes.js";
import type { multiSession } from "./index.js";

export * from "./error-codes.js";

export const multiSessionClient = () => {
	return {
		id: "multi-session",
		version: PACKAGE_VERSION,
		$InferServerPlugin: {} as ReturnType<typeof multiSession>,
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

export type { MultiSessionConfig } from "./index.js";
