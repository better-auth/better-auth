import type { BetterAuthClientPlugin } from "@better-auth/core";
import { PACKAGE_VERSION } from "../../version";
import type { SIWEPlugin } from ".";

export const siweClient = () => {
	return {
		id: "siwe",
		version: PACKAGE_VERSION,
		$InferServerPlugin: {} as SIWEPlugin,
		pathMethods: {
			"/siwe/nonce": "POST",
			"/siwe/get-nonce": "POST",
		},
	} satisfies BetterAuthClientPlugin;
};

export type { SIWEPlugin } from ".";
