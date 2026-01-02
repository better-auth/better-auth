import type { BetterAuthClientPlugin } from "@better-auth/core";
import type { multiSession } from ".";
import { MULTI_SESSION_ERROR_CODES } from "./error-codes";

export * from "./error-codes";

export const multiSessionClient = () => {
	return {
		id: "multi-session",
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

export type { MultiSessionConfig } from "./index";
