import type { BetterAuthClientPlugin } from "better-auth/client";
import type { scim } from "./index.js";
import { PACKAGE_VERSION } from "./version.js";

export const scimClient = () => {
	return {
		id: "scim-client",
		version: PACKAGE_VERSION,
		$InferServerPlugin: {} as ReturnType<typeof scim>,
	} satisfies BetterAuthClientPlugin;
};
