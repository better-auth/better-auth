import type { BetterAuthClientPlugin } from "../../types";
import type { oauthProvider } from "./oauth";

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
						if (ctx.body?.additionalData?.query) return;
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
							const body = JSON.parse(ctx.body ?? "{}");
							ctx.body = JSON.stringify({
								...body,
								oauth_query:
									typeof window !== "undefined"
										? window?.location?.search
										: undefined,
							});
						}
					},
				},
			},
		],
		$InferServerPlugin: {} as ReturnType<typeof oauthProvider>,
	} satisfies BetterAuthClientPlugin;
};
