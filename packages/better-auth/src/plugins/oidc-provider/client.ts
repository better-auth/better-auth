import type { BetterAuthClientPlugin } from "@better-auth/core";
import type { oidcProvider } from ".";

export const oidcClient = () => {
	return {
		id: "oidc-client",
		$InferServerPlugin: {} as ReturnType<typeof oidcProvider>,
	} satisfies BetterAuthClientPlugin;
};
