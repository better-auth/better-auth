import type { oidcProvider } from ".";
import type { BetterAuthClientPlugin } from "../../types";

export const oidcClient = () => {
	return {
		id: "oidc-client",
		$InferServerPlugin: {} as ReturnType<typeof oidcProvider>,
	} satisfies BetterAuthClientPlugin;
};
