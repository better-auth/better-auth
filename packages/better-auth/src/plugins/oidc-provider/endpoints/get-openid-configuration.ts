import type { MakeOidcPlugin } from "../make-oidc-plugin";
import type { ResolvedOIDCOptions } from "../utils/resolve-oidc-options";

import { createAuthEndpoint } from "../../../api";
import { resolveMetadata } from "../utils/resolve-metadata";

export const getOpenIdConfig = (
	options: ResolvedOIDCOptions,
	makePluginOpts: MakeOidcPlugin,
) =>
	createAuthEndpoint(
		"/.well-known/openid-configuration",
		{
			method: "GET",
			metadata: {
				isAction: false,
			},
		},
		async (ctx) => {
			const metadata = resolveMetadata(ctx, options, makePluginOpts);
			return ctx.json(metadata);
		},
	);
