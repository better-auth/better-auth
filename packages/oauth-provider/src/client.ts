import { safeJSONParse } from "@better-auth/core/utils";
import type { BetterAuthClientPlugin } from "better-auth/types";
import type { oauthProvider } from "./oauth";

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
						const pathname =
							typeof ctx.url === "string"
								? new URL(ctx.url).pathname
								: ctx.url.pathname;
						// Should only need to run for /sign-in/email, /sign-in/social, /sign-in/oauth2, /oauth2/consent, /oauth2/continue
						if (
							pathname.endsWith("/sign-in/email") ||
							pathname.endsWith("/sign-in/social") ||
							pathname.endsWith("/sign-in/oauth2") ||
							pathname.endsWith("/oauth2/consent") ||
							pathname.endsWith("/oauth2/continue")
						) {
							const oauthQuery =
								typeof window !== "undefined"
									? parseSignedQuery(window?.location?.search)
									: undefined;
							ctx.body = JSON.stringify({
								...body,
								oauth_query: oauthQuery,
							});
							// Set accept header to application/json when in OAuth flow
							// This ensures the server returns JSON redirect instead of throwing a redirect
							// which would cause CORS errors when fetch tries to follow cross-origin redirects
							if (oauthQuery) {
								ctx.headers.set("accept", "application/json");
							}
						}
					},
				},
			},
		],
		$InferServerPlugin: {} as ReturnType<typeof oauthProvider>,
	} satisfies BetterAuthClientPlugin;
};
