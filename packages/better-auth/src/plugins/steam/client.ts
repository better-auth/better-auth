import type { steam } from "./index.js";
import type { BetterAuthClientPlugin } from "../../client/types.js";

export const steamClient = () => {
	return {
		id: "steam-client",
		$InferServerPlugin: {} as ReturnType<typeof steam>,
		pathMethods: {
			"/sign-in/social/steam": "POST",
		},
	} satisfies BetterAuthClientPlugin;
};
