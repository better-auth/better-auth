import type { BetterAuthClientPlugin } from "better-auth/client";
import type { SCIMPlugin } from ".";
import { PACKAGE_VERSION } from "./version";

export const scimClient = () => {
	return {
		id: "scim-client",
		version: PACKAGE_VERSION,
		$InferServerPlugin: {} as SCIMPlugin,
	} satisfies BetterAuthClientPlugin;
};

export type { SCIMPlugin } from ".";
