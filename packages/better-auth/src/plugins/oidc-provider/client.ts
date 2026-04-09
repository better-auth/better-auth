import type { BetterAuthClientPlugin } from "@better-auth/core";
import { PACKAGE_VERSION } from "../../version";
import type { oidcProvider } from ".";

export const oidcClient = () => {
	return {
		id: "oidc-client",
		version: PACKAGE_VERSION,
		$InferServerPlugin: {} as ReturnType<typeof oidcProvider>,
	} satisfies BetterAuthClientPlugin;
};

export type OidcClientPlugin = ReturnType<typeof oidcClient>;

export type * from "./types";
