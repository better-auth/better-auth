import type { BetterAuthClientPlugin } from "@better-auth/core";
import type { tokenVault } from ".";

export const tokenVaultClient = () => {
	return {
		id: "token-vault",
		$InferServerPlugin: {} as ReturnType<typeof tokenVault>,
		pathMethods: {
			"/token-vault/store": "POST",
			"/token-vault/retrieve": "POST",
			"/token-vault/grants": "GET",
			"/token-vault/revoke": "POST",
		},
	} satisfies BetterAuthClientPlugin;
};
