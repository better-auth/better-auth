import type { BetterAuthClientPlugin } from "@better-auth/core";
import { PACKAGE_VERSION } from "../../version";
import type { siws } from ".";

export const siwsClient = () => {
	return {
		id: "siws",
		version: PACKAGE_VERSION,
		$InferServerPlugin: {} as ReturnType<typeof siws>,
		pathMethods: {
			"/siws/nonce": "POST",
		},
	} satisfies BetterAuthClientPlugin;
};
