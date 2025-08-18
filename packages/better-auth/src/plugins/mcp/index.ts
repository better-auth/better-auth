import type { BetterAuthPlugin } from "../../types";
import type { OIDCMetadata, OIDCOptions } from "../oidc/types";

import { makeOAuthDiscoveryMetadata, makeOIDCPlugin } from "../oidc";

export { withMcpAuth } from "./with-mcp-auth";

export const mcp = (options: OIDCOptions) => {
	const {
		schema,
		consentHook,
		oAuth2Token,
		oAuth2Client,
		oAuth2Consent,
		oAuth2UserInfo,
		oAuth2Register,
		oAuth2Authorize,
		oAuth2OpenIdConfig,
		oAuth2AccessTokenData,
	} = makeOIDCPlugin(
		{
			pathPrefix: "mcp",
			disableCors: true,
			alwaysSkipConsent: true,
		},
		options,
	);

	return {
		id: "mcp",
		schema,
		hooks: {
			after: consentHook,
		},
		endpoints: {
			mcpOAuth2Token: oAuth2Token,
			mcpOAuth2Client: oAuth2Client,
			mcpOAuth2Consent: oAuth2Consent,
			mcpOAuth2UserInfo: oAuth2UserInfo,
			mcpOAuth2Register: oAuth2Register,
			mcpOAuth2Authorize: oAuth2Authorize,
			mcpOAuth2OpenIdConfig: oAuth2OpenIdConfig,
			mcpOAuth2AccessTokenData: oAuth2AccessTokenData,
		},
	} satisfies BetterAuthPlugin;
};

export const mcpOAuth2DiscoveryMetadata = <
	Auth extends {
		api: {
			mcpOAuth2OpenIdConfig: (...args: any) => Promise<OIDCMetadata>;
		};
	},
>(
	auth: Auth,
) => makeOAuthDiscoveryMetadata(() => auth.api.mcpOAuth2OpenIdConfig());

export type * from "../oidc/types";
