import type { GenericEndpointContext } from "../../../types";
import type { ResolvedOIDCOptions } from "../utils/resolve-oidc-options";

import { getErrorURL } from "../utils/errors";
import { getClient } from "../utils/get-client";
import { makeRedirectHandler } from "../utils/redirect";

export async function resolveClient(
	ctx: GenericEndpointContext,
	clientId: string,
	options: ResolvedOIDCOptions,
) {
	const handleRedirect = makeRedirectHandler(ctx);

	const client = await getClient(ctx, clientId, options);

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
