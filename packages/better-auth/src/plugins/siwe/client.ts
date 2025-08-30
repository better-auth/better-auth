import type { siwe } from ".";
import type { BetterAuthClientPlugin } from "../../types";

export const siweClient = () => {
	return {
		id: "siwe",
		$InferServerPlugin: {} as ReturnType<typeof siwe>,
	} satisfies BetterAuthClientPlugin;
};
