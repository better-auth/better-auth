import { deviceAuthorizationClient } from "better-auth/client/plugins";
import type { BetterAuthClientPlugin } from "better-auth/types";
import type { oauthDeviceAuthorization } from "./device-code";
import type { oauthProvider } from "./oauth";
import { buildSignedOAuthQuery } from "./signed-query";
import { PACKAGE_VERSION } from "./version";

export const oauthProviderClient = () => {
	return {
		id: "oauth-provider-client",
		version: PACKAGE_VERSION,
		fetchPlugins: [
			{
				id: "oauth-provider-signin",
				name: "oauth-provider-signin",
				description: "Adds the current page query to oauth requests",
				hooks: {
					async onRequest(ctx) {
						if (ctx.method === "GET" || ctx.method === "DELETE") return;
						if (typeof window === "undefined") return;
						const oauthQuery = buildSignedOAuthQuery(window.location?.search);
						if (!oauthQuery) return;
						// Reading FormData, Blob or stream bodies would consume them.
						if (ctx.body && typeof ctx.body !== "string") return;
						if (
							ctx.headers.get("content-type") ===
							"application/x-www-form-urlencoded"
						) {
							const params = new URLSearchParams(ctx.body);
							if (params.get("oauth_query")) return;
							params.set("oauth_query", oauthQuery);
							ctx.body = params.toString();
							return;
						}
						// Plain JSON parse so ISO strings are not revived into Dates.
						const body = await new Response(ctx.body ?? "{}")
							.json()
							.catch(() => null);
						if (!body || body.oauth_query) return;
						ctx.body = JSON.stringify({
							...body,
							oauth_query: oauthQuery,
						});
					},
				},
			},
		],
		$InferServerPlugin: {} as ReturnType<typeof oauthProvider>,
	} satisfies BetterAuthClientPlugin;
};

/** Client plugin for {@link oauthDeviceAuthorization}. */
export const oauthDeviceAuthorizationClient = () => {
	return {
		...deviceAuthorizationClient(),
		$InferServerPlugin: {} as ReturnType<typeof oauthDeviceAuthorization>,
	} satisfies BetterAuthClientPlugin;
};
