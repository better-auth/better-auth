import type { BetterAuthClientPlugin } from "../../types";
import type { oauthProvider } from "./oauth";

export const oauthProviderClient = () => {
	return {
		id: "oauth-provider-client",
		$InferServerPlugin: {} as ReturnType<typeof oauthProvider>,
	} satisfies BetterAuthClientPlugin;
};
