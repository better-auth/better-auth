import type { BetterAuthPlugin } from "../../types";
import type { OIDCMetadata, OIDCOptions } from "../oidc/types";

import { makeMetadataEndpoint, makeOIDCPlugin } from "../oidc";

/**
 * OpenID Connect (OIDC) plugin for Better Auth. This plugin implements the
 * authorization code flow and the token exchange flow. It also implements the
 * userinfo endpoint.
 *
 * @param options - The options for the OIDC plugin.
 * @returns A Better Auth plugin.
 */
export const oidcProvider = (options: OIDCOptions) => {
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
			pathPrefix: "oauth2",
			disableCors: false,
			alwaysSkipConsent: false,
			modelNames: {
				oauthClient: "oauthApplication",
				oauthAccessToken: "oauthAccesToken",
				oauthConsent: "oauthConsent",
			},
		},
		options,
	);

	return {
		id: "oidc",
		schema,
		hooks: {
			after: consentHook,
		},
		endpoints: {
			oAuth2Token,
			oAuth2Client,
			oAuth2Consent,
			oAuth2UserInfo,
			oAuth2Register,
			oAuth2Authorize,
			oAuth2OpenIdConfig,
			oAuth2AccessTokenData,
		},
	} satisfies BetterAuthPlugin;
};

export const oAuth2OpenIdConfigEndpoint = <
	Auth extends {
		api: {
			oAuth2OpenIdConfig: (...args: any) => Promise<OIDCMetadata>;
		};
	},
>(
	auth: Auth,
) => makeMetadataEndpoint(() => auth.api.oAuth2OpenIdConfig());

export type * from "../oidc/types";
