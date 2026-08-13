import type { BetterAuthClientPlugin } from "@better-auth/core";
import { PACKAGE_VERSION } from "../../version";
import type { MagicLinkPlugin } from ".";

export const magicLinkClient = () => {
	return {
		id: "magic-link",
		version: PACKAGE_VERSION,
		$InferServerPlugin: {} as MagicLinkPlugin,
	} satisfies BetterAuthClientPlugin;
};

export type { MagicLinkPlugin } from ".";
