import type { BetterAuthClientPlugin } from "better-auth";
import { sso } from "./index";
export const ssoClient = () => {
	return {
		id: "sso-client",
		$InferServerPlugin: {} as ReturnType<typeof sso>,
	} satisfies BetterAuthClientPlugin;
};
