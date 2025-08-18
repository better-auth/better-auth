import type { OIDCMetadata } from "../oidc/types";

import { makeOAuthDiscoveryMetadata, makeOIDCPlugin } from "../oidc";

export { withMcpAuth } from "./with-mcp-auth";

export const mcp = makeOIDCPlugin({
	id: "mcp",
	pathPrefix: "mcp",
	disableCors: true,
	alwaysSkipConsent: true,
});

export const oAuthDiscoveryMetadata = <
	Auth extends {
		api: {
			getMcpOAuthConfig: (...args: any) => Promise<OIDCMetadata>;
		};
	},
>(
	auth: Auth,
) => makeOAuthDiscoveryMetadata(() => auth.api.getMcpOAuthConfig());

export type * from "../oidc/types";
