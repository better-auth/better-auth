import type { OIDCOptions } from "./types";
import type { BetterAuthPlugin } from "../../types";

import { schema } from "./schema";
import { consentHook } from "./hooks/consent-hook";
import { getOpenIdConfig } from "./endpoints/get-openid-configuration";
import { resolveOIDCOptions } from "./utils/resolve-oidc-options";

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
			},
		} satisfies BetterAuthPlugin;
	};
