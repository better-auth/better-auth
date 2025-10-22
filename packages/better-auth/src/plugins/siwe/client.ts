import type { siwe } from ".";
import type { BetterAuthClientPlugin } from "@better-auth/core";

export const siweClient = () => {
	return {
		id: "siwe",
		$InferServerPlugin: {} as ReturnType<typeof siwe>,
	} satisfies BetterAuthClientPlugin;
};
