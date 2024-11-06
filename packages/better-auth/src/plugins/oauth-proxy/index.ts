import { z } from "zod";
import { createAuthEndpoint, createAuthMiddleware } from "../../api";
import { symmetricDecrypt, symmetricEncrypt } from "../../crypto";
import type { BetterAuthPlugin } from "../../types";
import { env } from "../../utils/env";

function getVenderBaseURL() {
	const vercel = env.VERCEL_URL;
	const netlify = env.NETLIFY_URL;
	const render = env.RENDER_URL;
	const aws = env.AWS_LAMBDA_FUNCTION_NAME;
	const google = env.GOOGLE_CLOUD_FUNCTION_NAME;
	const azure = env.AZURE_FUNCTION_NAME;

	return vercel || netlify || render || aws || google || azure;
}

interface OAuthProxyOptions {
	/**
	 * The current URL of the application.
	 * The plugin will attempt to infer the current URL from your environment
	 * by checking the base URL from popular hosting providers,
	 * from the request URL if invoked by a client,
	 * or as a fallback, from the `baseURL` in your auth config.
	 * If the URL is not inferred correctly, you can provide a value here."
	 */
	currentURL?: string;
}

/**
 * A proxy plugin, that allows you to proxy OAuth requests.
 * Useful for development and preview deployments where
 * the redirect URL can't be known in advance to add to the OAuth provider.
 */
export const oAuthProxy = (opts?: OAuthProxyOptions) => {
	return {
		id: "oauth-proxy",
		endpoints: {
			oAuthProxy: createAuthEndpoint(
				"/oauth-proxy-callback",
				{
					method: "GET",
					query: z.object({
						callbackURL: z.string(),
						cookies: z.string(),
					}),
				},
				async (ctx) => {
					const cookies = ctx.query.cookies;
					const decryptedCookies = await symmetricDecrypt({
						key: ctx.context.secret,
						data: cookies,
					});
					ctx.setHeader("set-cookie", decryptedCookies);
					/**
					 * Here the callback url will be already validated in against trusted origins
					 * so we don't need to do that here
					 */
					throw ctx.redirect(ctx.query.callbackURL);
				},
			),
		},
		hooks: {
			after: [
				{
					matcher(context) {
						return context.path?.startsWith("/callback");
					},
					handler: createAuthMiddleware(async (ctx) => {
						const response = ctx.context.returned;
						if (!response) {
							return;
						}
						const location = response.headers.get("location");
						if (location?.includes("/oauth-proxy-callback?callbackURL")) {
							if (!location.startsWith("http")) {
								return;
							}
							const origin = new URL(location).origin;

							/**
							 * We don't want to redirect to the proxy URL if the origin is the same
							 * as the current URL
							 */
							if (origin === ctx.context.baseURL) {
								return;
							}

							const setCookies = response.headers.get("set-cookie");
							if (!setCookies) {
								return;
							}
							const encryptedCookies = await symmetricEncrypt({
								key: ctx.context.secret,
								data: setCookies,
							});
							const locationWithCookies = `${location}&cookies=${encodeURIComponent(
								encryptedCookies,
							)}`;
							response.headers.set("location", locationWithCookies);
							return {
								response,
							};
						}
					}),
				},
			],
			before: [
				{
					matcher(context) {
						return context.path?.startsWith("/sign-in/social");
					},
					async handler(ctx) {
						const url = new URL(
							opts?.currentURL ||
								ctx.request?.url ||
								getVenderBaseURL() ||
								ctx.context.baseURL,
						);
						ctx.body.callbackURL = `${url.origin}${
							ctx.context.options.basePath || "/api/auth"
						}/oauth-proxy-callback?callbackURL=${encodeURIComponent(
							ctx.body.callbackURL || ctx.context.baseURL,
						)}`;
						return {
							context: ctx,
						};
					},
				},
			],
		},
	} satisfies BetterAuthPlugin;
};
