import type { BetterAuthClientPlugin } from "better-auth";
import type { siwe } from ".";

type SiwePlugin = typeof siwe;

export const siweClientPlugin = () => {
	return {
		id: "siwe",
		$InferServerPlugin: {} as ReturnType<SiwePlugin>,
	} satisfies BetterAuthClientPlugin;
};
