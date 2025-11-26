import type { BetterAuthClientPlugin } from "better-auth";
import type { scim } from "./index";

export const scimClient = () => {
	return {
		id: "scim-client",
		$InferServerPlugin: {} as ReturnType<typeof scim>,
	} satisfies BetterAuthClientPlugin;
};
