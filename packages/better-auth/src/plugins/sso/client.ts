import type { sso } from ".";
import type { BetterAuthClientPlugin } from "../../types";

export const ssoClient = () => {
	return {
		id: "sso-client",
		$InferServerPlugin: {} as ReturnType<typeof sso>,
	} satisfies BetterAuthClientPlugin;
};
