import type { steamAuth } from "./index.js";
import type { BetterAuthClientPlugin } from "better-auth";

export const steamAuthClient = () => {
	return {
		id: "steam-auth-client",
		$InferServerPlugin: {} as ReturnType<typeof steamAuth>,
	} satisfies BetterAuthClientPlugin;
};
