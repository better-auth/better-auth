import type { magicLink } from ".";
import type { BetterAuthClientPlugin } from "../../client/types";

export const magicLinkClient = () => {
	return {
		id: "magic-link",
		$InferServerPlugin: {} as ReturnType<typeof magicLink>,
	} satisfies BetterAuthClientPlugin;
};
