import type { OIDCOptions } from "./types";
import type { BetterAuthPlugin } from "../../types";

import { schema } from "./schema";
import { consentHook } from "./hooks/consent-hook";
import { oAuth2token } from "./endpoints/oauth2-token";
import { oAuthConsent } from "./endpoints/oauth2-consent";
import { oAuth2userInfo } from "./endpoints/oauth2-user-info";
import { oAuth2authorize } from "./endpoints/oauth2-authorize";
import { resolveOIDCOptions } from "./utils/resolve-oidc-options";
import { getOpenIdConfig } from "./endpoints/get-openid-configuration";

export type MakeOidcPlugin = {
	id: string;
	pathPrefix: string;
	alwaysSkipConsent: boolean;
	disableCorsInAuthorize: boolean;
};

export const makeOidcPlugin =
	(makePluginOpts: MakeOidcPlugin) => (options: OIDCOptions) => {
		const resolved = resolveOIDCOptions(options);

		return {
			id: makePluginOpts.id,
			schema,
			hooks: {
				after: consentHook(resolved, makePluginOpts),
			},
			endpoints: {
				getOpenIdConfig: getOpenIdConfig(resolved, makePluginOpts),
				oAuth2authorize: oAuth2authorize(resolved, makePluginOpts),
				oAuthConsent: oAuthConsent(resolved, makePluginOpts),
				oAuth2token: oAuth2token(resolved, makePluginOpts),
				oAuth2userInfo: oAuth2userInfo(resolved, makePluginOpts),
			},
		} satisfies BetterAuthPlugin;
	};
