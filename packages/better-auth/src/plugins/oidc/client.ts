import type { oidc } from ".";
import type { BetterAuthClientPlugin } from "../../types";

export const oidcClient = () => {
	return {
		id: "oidc-client",
		$InferServerPlugin: {} as ReturnType<typeof oidc>,
	} satisfies BetterAuthClientPlugin;
};
