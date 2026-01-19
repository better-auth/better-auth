import type { BetterAuthClientPlugin } from "@better-auth/core";
import type { anonymous } from ".";
import { ANONYMOUS_ERROR_CODES } from "./error-codes";

export const anonymousClient = () => {
	return {
		id: "anonymous",
		$InferServerPlugin: {} as ReturnType<typeof anonymous>,
		pathMethods: {
			"/sign-in/anonymous": "POST",
			"/delete-anonymous-user": "POST",
		},
		atomListeners: [
			{
				matcher: (path) => path === "/sign-in/anonymous",
				signal: "$sessionSignal",
			},
		],
		$ERROR_CODES: ANONYMOUS_ERROR_CODES,
	} satisfies BetterAuthClientPlugin;
};

export * from "./error-codes";
export type * from "./schema";
export type * from "./types";
