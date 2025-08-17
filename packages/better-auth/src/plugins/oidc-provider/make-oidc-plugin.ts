import type { OIDCOptions } from "./types";
import type { BetterAuthPlugin } from "../../types";

import { schema } from "./schema";
import { makeOpts } from "./utils/make-opts";
import { consentHook } from "./hooks/consent-hook";
import { getOpenIdConfig } from "./endpoints/get-openid-configuration";

export type MakeOidcPlugin = {
	id: string;
	pathPrefix: string;
	alwaysSkipConsent: boolean;
	disableCorsInAuthorize: boolean;
};

export const makeOidcPlugin =
	(makePluginOpts: MakeOidcPlugin) => (options: OIDCOptions) => {
		const opts = makeOpts(options);

		return {
			id: makePluginOpts.id,
			schema,
			hooks: {
				after: consentHook(opts, makePluginOpts),
			},
			endpoints: {
				getOpenIdConfig: getOpenIdConfig(opts, makePluginOpts),
			},
		} satisfies BetterAuthPlugin;
	};
