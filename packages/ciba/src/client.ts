import type { BetterAuthClientPlugin } from "better-auth/client";
import type { ciba } from "./index";

export const cibaClient = () =>
	({
		id: "ciba",
		$InferServerPlugin: {} as ReturnType<typeof ciba>,
		pathMethods: {
			"/oauth2/bc-authorize": "POST",
			"/ciba/verify": "GET",
			"/ciba/authorize": "POST",
			"/ciba/reject": "POST",
		},
	}) satisfies BetterAuthClientPlugin;
