import type { BetterAuthClientPlugin } from "@better-auth/core";
import type { tokenExchange } from ".";

export const tokenExchangeClient = () => {
	return {
		id: "token-exchange",
		$InferServerPlugin: {} as ReturnType<typeof tokenExchange>,
		pathMethods: {
			"/oauth/token": "POST",
		},
	} satisfies BetterAuthClientPlugin;
};
