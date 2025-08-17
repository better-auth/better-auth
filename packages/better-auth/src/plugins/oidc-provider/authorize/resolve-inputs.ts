import type { GenericEndpointContext } from "../../../types";
import type { ResolvedOIDCOptions } from "../utils/resolve-oidc-options";

import { APIError } from "../../../api";
import { resolveQuery } from "./resolve-query";
import { resolveClient } from "./resolve-client";
import { resolveSession } from "./resolve-session";

export async function resolveInputs(
	ctx: GenericEndpointContext,
	options: ResolvedOIDCOptions,
) {
	const query = resolveQuery(ctx, options);
	const client = await resolveClient(ctx, query.clientId, options);
	const session = await resolveSession(ctx, options);

	if (!client.redirectURLs.includes(query.redirectURI)) {
		throw new APIError("BAD_REQUEST", { message: "Invalid redirect URI" });
	}

	return {
		session,
		client,
		query,
	};
}
