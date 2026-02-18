import type { BetterAuthClientPlugin } from "@better-auth/core";
import type { oneTimeToken } from "./index";

export const oneTimeTokenClient = () => {
	return {
		id: "one-time-token",
		$InferServerPlugin: {} as ReturnType<typeof oneTimeToken>,
	} satisfies BetterAuthClientPlugin;
};

export type { OneTimeTokenOptions } from "./index";
