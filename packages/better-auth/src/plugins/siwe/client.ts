import type { BetterAuthClientPlugin } from "@better-auth/core";
import type { siwe } from ".";

export const siweClient = () => {
	return {
		id: "siwe",
		$InferServerPlugin: {} as ReturnType<typeof siwe>,
	} satisfies BetterAuthClientPlugin;
};
