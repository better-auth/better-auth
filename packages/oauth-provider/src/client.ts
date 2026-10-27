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
						if (typeof window === "undefined" || !window.location?.search)
							return;
						if (ctx.method === "GET" || ctx.method === "DELETE") return;
						const oauthQuery = buildSignedOAuthQuery(window.location.search);
						if (!oauthQuery) return;

						const headers = ctx.headers;
						const body =
							typeof ctx.body === "string"
								? headers.get("content-type") ===
									"application/x-www-form-urlencoded"
									? Object.fromEntries(new URLSearchParams(ctx.body))
									: (JSON.parse(ctx.body) as Record<string, unknown>)
								: ctx.body;
						if (body?.oauth_query) return;
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
