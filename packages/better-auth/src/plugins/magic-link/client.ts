import type { magicLink } from ".";
import type { BetterAuthClientPlugin } from "@better-auth/core";

export const magicLinkClient = () => {
	return {
		id: "magic-link",
		$InferServerPlugin: {} as ReturnType<typeof magicLink>,
	} satisfies BetterAuthClientPlugin;
};
