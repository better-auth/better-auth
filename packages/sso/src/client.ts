import type { sso } from "./index";
import { type BetterAuthClientPlugin } from "../../better-auth/src";
export const ssoClient = () => {
	return {
		id: "sso-client",
		$InferServerPlugin: {} as ReturnType<typeof sso>,
	} satisfies BetterAuthClientPlugin;
};
