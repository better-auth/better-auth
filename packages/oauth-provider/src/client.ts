import { deviceAuthorizationClient } from "better-auth/client/plugins";
import type { BetterAuthClientPlugin } from "better-auth/types";
import type { oauthDeviceAuthorization } from "./device-code";
import type { oauthProvider } from "./oauth";
import { buildSignedOAuthQuery } from "./signed-query";
import { PACKAGE_VERSION } from "./version";

function parseJSONBody(body: string): Record<string, unknown> | null {
	try {
		return JSON.parse(body || "{}");
	} catch {
		return null;
	}
}

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
						if (
							typeof window === "undefined" ||
							!window?.location?.search ||
							ctx.method === "GET" ||
							ctx.method === "DELETE"
						) {
							return;
						}
						const isForm =
							ctx.headers.get("content-type") ===
							"application/x-www-form-urlencoded";
						if (typeof ctx.body === "string" && isForm) {
							const params = new URLSearchParams(ctx.body);
							if (params.get("oauth_query")) return;
							const oauthQuery = buildSignedOAuthQuery(window.location.search);
							if (oauthQuery === undefined) return;
							params.set("oauth_query", oauthQuery);
							ctx.body = params.toString();
							return;
						}
						// Plain JSON.parse so ISO date strings are sent back unchanged.
						const body =
							typeof ctx.body === "string" ? parseJSONBody(ctx.body) : ctx.body;
						if (body?.oauth_query) return;
						const oauthQuery = buildSignedOAuthQuery(window.location.search);
						if (oauthQuery === undefined) return;
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
