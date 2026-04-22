import type { BetterAuthClientPlugin } from "@better-auth/core";
import { PACKAGE_VERSION } from "../../version.js";
import { ANONYMOUS_ERROR_CODES } from "./error-codes.js";
import type { anonymous } from "./index.js";

export const anonymousClient = () => {
	return {
		id: "anonymous",
		version: PACKAGE_VERSION,
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

export * from "./error-codes.js";
export type * from "./schema.js";
export type * from "./types.js";
