import type { BetterAuthClientPlugin } from "@better-auth/core";
import type { organization } from "../organization";

export const organizationClient = () => {
	return {
		id: "organization",
		$InferServerPlugin: {} as ReturnType<typeof organization>,
	} satisfies BetterAuthClientPlugin;
};
