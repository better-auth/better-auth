import type { BetterAuthClientPlugin } from "@better-auth/core";
import { PACKAGE_VERSION } from "../../version";
import type { OneTimeTokenPlugin } from ".";

export const oneTimeTokenClient = () => {
	return {
		id: "one-time-token",
		version: PACKAGE_VERSION,
		$InferServerPlugin: {} as OneTimeTokenPlugin,
	} satisfies BetterAuthClientPlugin;
};

export type { OneTimeTokenOptions, OneTimeTokenPlugin } from ".";
