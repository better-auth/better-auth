import type { BetterAuthClientPlugin } from "@better-auth/core";
import { PACKAGE_VERSION } from "../../version.js";
import type { oneTimeToken } from "./index.js";

export const oneTimeTokenClient = () => {
	return {
		id: "one-time-token",
		version: PACKAGE_VERSION,
		$InferServerPlugin: {} as ReturnType<typeof oneTimeToken>,
	} satisfies BetterAuthClientPlugin;
};

export type { OneTimeTokenOptions } from "./index.js";
