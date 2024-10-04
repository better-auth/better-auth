import type { anonymous } from ".";
import type { BetterAuthClientPlugin } from "../../client/types";

export const anonymousClient = () => {
	return {
		id: "anonymous",
		$InferServerPlugin: {} as ReturnType<typeof anonymous>,
		pathMethods: {
			"/sign-in/anonymous": "POST",
		},
	} satisfies BetterAuthClientPlugin;
};
