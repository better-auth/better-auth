import type { apiKey } from ".";
import type { BetterAuthClientPlugin } from "../../types";

export const apiKeyClient = () => {
	return {
		id: "api-key",
		$InferServerPlugin: {} as ReturnType<typeof apiKey>,
		pathMethods: {
			"/api-key/create": "POST",
		},
	} satisfies BetterAuthClientPlugin;
};
