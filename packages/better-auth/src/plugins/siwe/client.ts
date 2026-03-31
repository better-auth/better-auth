import type { BetterAuthClientPlugin } from "@better-auth/core";
import { PACKAGE_VERSION } from "../../version";
import type { siwe } from ".";

export const siweClient = () => {
	return {
		id: "siwe",
		version: PACKAGE_VERSION,
		$InferServerPlugin: {} as ReturnType<typeof siwe>,
	} satisfies BetterAuthClientPlugin;
};
