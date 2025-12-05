import type { BetterAuthClientPlugin } from "@better-auth/core";
import type { anonymous } from ".";

export const anonymousClient = () => {
	return {
		id: "anonymous",
		$InferServerPlugin: {} as ReturnType<typeof anonymous>,
		pathMethods: {
			"/sign-in/anonymous": "POST",
		},
		atomListeners: [
			{
				matcher: (path) => path === "/sign-in/anonymous",
				signal: "$sessionSignal",
			},
		],
	} satisfies BetterAuthClientPlugin;
};

export type * from "./schema";
export type * from "./types";
