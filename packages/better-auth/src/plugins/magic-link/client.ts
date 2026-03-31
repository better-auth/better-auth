import type { BetterAuthClientPlugin } from "@better-auth/core";
import { PACKAGE_VERSION } from "../../version";
import type { magicLink } from ".";

export const magicLinkClient = () => {
	return {
		id: "magic-link",
		version: PACKAGE_VERSION,
		$InferServerPlugin: {} as ReturnType<typeof magicLink>,
	} satisfies BetterAuthClientPlugin;
};
