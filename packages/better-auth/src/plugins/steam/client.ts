import type { steamAuth } from "./index.js";
import type { BetterAuthClientPlugin } from "../../client/types.js";

export const steamAuthClient = () => {
	return {
		id: "steam-auth-client",
		$InferServerPlugin: {} as ReturnType<typeof steamAuth>,
		pathMethods: {
			"/sign-in/steam": "POST",
		},
	} satisfies BetterAuthClientPlugin;
};
