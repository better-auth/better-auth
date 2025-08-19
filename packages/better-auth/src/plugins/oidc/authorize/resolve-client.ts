import type { MakeOIDCPlugin } from "../index";
import type { GenericEndpointContext } from "../../../types";
import type { ResolvedOIDCOptions } from "../utils/resolve-oidc-options";

import { getErrorURL } from "../utils/errors";
import { getClient } from "../utils/get-client";
import { makeRedirectHandler } from "../utils/redirect";

export async function resolveClient(
	ctx: GenericEndpointContext,
	options: ResolvedOIDCOptions,
	makePluginOpts: MakeOIDCPlugin,
	clientId: string,
) {
	const handleRedirect = makeRedirectHandler(ctx);

	const client = await getClient(ctx, options, makePluginOpts, clientId);

	if (!client) {
		throw handleRedirect(
			getErrorURL(ctx, "invalid_client", "client not found"),
		);
	}
	if (client.disabled) {
		throw handleRedirect(
			getErrorURL(ctx, "client_disabled", "client is disabled"),
		);
	}

	return client;
}
