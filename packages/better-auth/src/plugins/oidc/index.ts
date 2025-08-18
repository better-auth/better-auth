import type { OIDCMetadata, OIDCOptions } from "./types";
import type { BetterAuthPlugin } from "../../types";

import { schema } from "./schema";
import { consentHook } from "./hooks/consent-hook";
import { oAuth2token } from "./endpoints/oauth2-token";
import { oAuthConsent } from "./endpoints/oauth2-consent";
import { oAuth2userInfo } from "./endpoints/oauth2-user-info";
import { getOAuthClient } from "./endpoints/get-oauth-client";
import { oAuth2authorize } from "./endpoints/oauth2-authorize";
import { resolveOIDCOptions } from "./utils/resolve-oidc-options";
import { getOpenIdConfig } from "./endpoints/get-openid-configuration";
import { registerOAuthApplication } from "./endpoints/oauth2-register";
import { getAccessTokenData } from "./endpoints/get-access-token-data";

export type MakeOIDCPlugin = {
	id: string;
	pathPrefix: string;
	disableCors: boolean;
	alwaysSkipConsent: boolean;
};

export const makeOIDCPlugin =
	(makePluginOpts: MakeOIDCPlugin) => (options: OIDCOptions) => {
		const resolved = resolveOIDCOptions(options);

		return {
			id: makePluginOpts.id,
			schema,
			hooks: {
				after: consentHook(resolved, makePluginOpts),
			},
			endpoints: {
				oAuth2token: oAuth2token(resolved, makePluginOpts),
				oAuthConsent: oAuthConsent(resolved, makePluginOpts),
				getOAuthClient: getOAuthClient(resolved, makePluginOpts),
				oAuth2userInfo: oAuth2userInfo(resolved, makePluginOpts),
				getOpenIdConfig: getOpenIdConfig(resolved, makePluginOpts),
				oAuth2authorize: oAuth2authorize(resolved, makePluginOpts),
				registerOAuthApplication: registerOAuthApplication(
					resolved,
					makePluginOpts,
				),

				getAccessTokenData: getAccessTokenData(makePluginOpts),
			},
		} satisfies BetterAuthPlugin;
	};

export const makeOAuthDiscoveryMetadata =
	(getOpenIdConfig: () => Promise<OIDCMetadata>) => async (_: Request) => {
		const res = await getOpenIdConfig();
		return new Response(JSON.stringify(res), {
			status: 200,
			headers: {
				"Content-Type": "application/json",
				"Access-Control-Allow-Origin": "*",
				"Access-Control-Allow-Methods": "POST, OPTIONS",
				"Access-Control-Allow-Headers": "Content-Type, Authorization",
				"Access-Control-Max-Age": "86400",
			},
		});
	};
