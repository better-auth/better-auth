import type { BetterAuthClientPlugin } from "@better-auth/core";
import type { anonymous } from ".";

export const anonymousClient = () => {
	return {
		id: "anonymous",
		$InferServerPlugin: {} as ReturnType<typeof anonymous>,
		pathMethods: {
			"/sign-in/anonymous": "POST",
		},
	} satisfies BetterAuthClientPlugin;
};
