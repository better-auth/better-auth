import type { BetterAuthClientPlugin } from "@better-auth/core";
import { PACKAGE_VERSION } from "../../version.js";
import type { magicLink } from "./index.js";

export const magicLinkClient = () => {
	return {
		id: "magic-link",
		version: PACKAGE_VERSION,
		$InferServerPlugin: {} as ReturnType<typeof magicLink>,
	} satisfies BetterAuthClientPlugin;
};
