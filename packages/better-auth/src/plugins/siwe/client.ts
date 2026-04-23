import type { BetterAuthClientPlugin } from "@better-auth/core";
import { PACKAGE_VERSION } from "../../version.js";
import type { siwe } from "./index.js";

export const siweClient = () => {
	return {
		id: "siwe",
		version: PACKAGE_VERSION,
		$InferServerPlugin: {} as ReturnType<typeof siwe>,
	} satisfies BetterAuthClientPlugin;
};
