import type { BetterAuthClientPlugin } from "@better-auth/core";
import type { siwx } from ".";

export const siwxClient = () => {
	return {
		id: "siwx",
		$InferServerPlugin: {} as ReturnType<typeof siwx>,
	} satisfies BetterAuthClientPlugin;
};
