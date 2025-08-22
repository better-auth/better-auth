import type { oauthProvider } from ".";
import type { BetterAuthClientPlugin } from "../../types";

export const oauthProviderClient = () => {
	return {
		id: "oauthProvider-client",
		$InferServerPlugin: {} as ReturnType<typeof oauthProvider>,
	} satisfies BetterAuthClientPlugin;
};
