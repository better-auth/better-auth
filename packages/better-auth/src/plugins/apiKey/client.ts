import type { apiKey } from ".";
import type { BetterAuthClientPlugin } from "../../types";

export const apiKeyClient = () => {
	return {
		id: "apiKey",
		$InferServerPlugin: {} as ReturnType<typeof apiKey>,
		pathMethods: {},
	} satisfies BetterAuthClientPlugin;
};
