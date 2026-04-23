import { safeJSONParse } from "@better-auth/core/utils/json";
import type { BetterAuthClientPlugin } from "better-auth/types";
import type { oauthProvider } from "./oauth.js";
import { PACKAGE_VERSION } from "./version.js";

function parseSignedQuery(search: string) {
	const params = new URLSearchParams(search);
	if (params.has("sig")) {
		const signedParams = new URLSearchParams();
		for (const [key, value] of params.entries()) {
			signedParams.append(key, value);
			if (key === "sig") break;
		}
		return signedParams.toString();
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
						const headers = ctx.headers;
						const body =
							typeof ctx.body === "string"
								? headers.get("content-type") ===
									"application/x-www-form-urlencoded"
									? Object.fromEntries(new URLSearchParams(ctx.body))
									: safeJSONParse<Record<string, unknown>>(ctx.body ?? "{}")
								: ctx.body;
						if (body?.oauth_query) return;
						if (
							typeof window !== "undefined" &&
							window?.location?.search &&
							!(ctx.method === "GET" || ctx.method === "DELETE")
						) {
							ctx.body = JSON.stringify({
								...body,
								oauth_query: parseSignedQuery(window.location.search),
							});
						}
					},
				},
			},
		],
		$InferServerPlugin: {} as ReturnType<typeof oauthProvider>,
	} satisfies BetterAuthClientPlugin;
};
