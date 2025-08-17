import type { OIDCOptions } from "./types";
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

export type MakeOIDCPlugin = {
	id: string;
	pathPrefix: string;
	alwaysSkipConsent: boolean;
	disableCors: boolean;
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
			},
		} satisfies BetterAuthPlugin;
	};
