import type { oauthProvider } from "./oauth";
import type { BetterAuthClientPlugin } from "../../types";

export const oauthProviderClient = () => {
	return {
		id: "oauth-provider-client",
		$InferServerPlugin: {} as ReturnType<typeof oauthProvider>,
	} satisfies BetterAuthClientPlugin;
};
