import type { BetterAuthClientPlugin } from "better-auth";
import { ssoSAML } from ".";
export const ssoSAMLClient = () => {
	return {
		id: "saml-client",
		$InferServerPlugin: {} as ReturnType<typeof ssoSAML>,
	} satisfies BetterAuthClientPlugin;
};
