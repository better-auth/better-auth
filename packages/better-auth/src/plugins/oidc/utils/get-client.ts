import type { Client } from "../types";
import type { GenericEndpointContext } from "../../../types";
import type { ResolvedOIDCOptions } from "./resolve-oidc-options";

export async function getClient(
	ctx: GenericEndpointContext,
	clientId: string,
	options: ResolvedOIDCOptions,
): Promise<Client | null> {
	const trustedClient = options.trustedClients.find(
		(client) => client.clientId === clientId,
	);

	if (trustedClient) {
		return trustedClient;
	}

	const dbClient = await ctx.context.adapter
		.findOne({
			model: "oauthApplication",
			where: [{ field: "clientId", value: clientId }],
		})
		.then((res: any) => {
			if (!res) {
				return null;
			}

			let metadata = null;
			try {
				if (res.metadata) {
					metadata = JSON.parse(res.metadata);
				}
			} catch {}

			return {
				...res,
				redirectURLs: (res.redirectURLs ?? "").split(","),
				metadata,
			} as Client;
		});

	return dbClient;
}
