import type { BetterAuthPlugin } from "@better-auth/core";
import {
	createAuthEndpoint,
	createAuthMiddleware,
} from "@better-auth/core/api";
import { env } from "@better-auth/core/env";
import type { EndpointContext } from "better-call";
import * as z from "zod";
import { originCheck } from "../../api";
import { parseJSON } from "../../client/parser";
import { symmetricDecrypt, symmetricEncrypt } from "../../crypto";
import { getOrigin } from "../../utils/url";

function getVendorBaseURL() {
	const vercel = env.VERCEL_URL ? `https://${env.VERCEL_URL}` : undefined;
	const netlify = env.NETLIFY_URL;
	const render = env.RENDER_URL;
	const aws = env.AWS_LAMBDA_FUNCTION_NAME;
	const google = env.GOOGLE_CLOUD_FUNCTION_NAME;
	const azure = env.AZURE_FUNCTION_NAME;

	return vercel || netlify || render || aws || google || azure;
}

export interface OAuthProxyOptions {
	/**
	 * The current URL of the application.
	 * The plugin will attempt to infer the current URL from your environment
	 * by checking the base URL from popular hosting providers,
	 * from the request URL if invoked by a client,
	 * or as a fallback, from the `baseURL` in your auth config.
	 * If the URL is not inferred correctly, you can provide a value here."
	 */
	currentURL?: string | undefined;
	/**
	 * If a request in a production url it won't be proxied.
	 *
	 * default to `BETTER_AUTH_URL`
	 */
	productionURL?: string | undefined;
}

/**
 * A proxy plugin, that allows you to proxy OAuth requests.
 * Useful for development and preview deployments where
 * the redirect URL can't be known in advance to add to the OAuth provider.
 */
export const oAuthProxy = (opts?: OAuthProxyOptions | undefined) => {
	const resolveCurrentURL = (ctx: EndpointContext<string, any>) => {
		return new URL(
			opts?.currentURL ||
				ctx.request?.url ||
				getVendorBaseURL() ||
				ctx.context.baseURL,
		);
	};

	const checkSkipProxy = (ctx: EndpointContext<string, any>) => {
		// If skip proxy header is set, we don't need to proxy
		const skipProxyHeader = ctx.request?.headers.get("x-skip-oauth-proxy");
		if (skipProxyHeader) {
			return true;
		}

		const productionURL = opts?.productionURL || env.BETTER_AUTH_URL;
		if (!productionURL) {
			return false;
		}

		// Use request URL to determine current environment, not baseURL
		// because baseURL is always the production URL
		const currentURL = ctx.request?.url || getVendorBaseURL();
		if (!currentURL) {
			return false;
		}

		// Compare origins - if same, we're in production so skip proxy
		const productionOrigin = getOrigin(productionURL);
		const currentOrigin = getOrigin(currentURL);

		return productionOrigin === currentOrigin;
	};

	return {
		id: "oauth-proxy",
		options: opts,
		endpoints: {
			oAuthProxy: createAuthEndpoint(
				"/oauth-proxy-callback",
				{
					method: "GET",
					operationId: "oauthProxyCallback",
					query: z.object({
						callbackURL: z.string().meta({
							description: "The URL to redirect to after the proxy",
						}),
						cookies: z.string().meta({
							description: "The cookies to set after the proxy",
						}),
					}),
					use: [originCheck((ctx) => ctx.query.callbackURL)],
					metadata: {
						openapi: {
							operationId: "oauthProxyCallback",
							description: "OAuth Proxy Callback",
							parameters: [
								{
									in: "query",
									name: "callbackURL",
									required: true,
									description: "The URL to redirect to after the proxy",
								},
								{
									in: "query",
									name: "cookies",
									required: true,
									description: "The cookies to set after the proxy",
								},
							],
							responses: {
								302: {
									description: "Redirect",
									headers: {
										Location: {
											description: "The URL to redirect to",
											schema: {
												type: "string",
											},
										},
									},
								},
							},
						},
					},
				},
				async (ctx) => {
					const cookies = ctx.query.cookies;

					const decryptedCookies = await symmetricDecrypt({
						key: ctx.context.secret,
						data: cookies,
					}).catch((e) => {
						ctx.context.logger.error(e);
						return null;
					});
					if (!decryptedCookies) {
						const error =
							ctx.context.options.onAPIError?.errorURL ||
							`${ctx.context.options.baseURL}/api/auth/error`;

						throw ctx.redirect(
							`${error}?error=OAuthProxy - Invalid cookies or secret`,
						);
					}

					const prefix =
						ctx.context.options.advanced?.cookiePrefix || "better-auth";
					const securePrefix = `__Secure-${prefix}`;
					const currentURL = resolveCurrentURL(ctx);
					const isSecureContext = currentURL.protocol === "https:";

					// Process cookies: normalize for current environment
					const processedCookies = decryptedCookies
						.split(/,(?=\s*[^,]+=)/)
						.map((cookie) => {
							const parts = cookie.split(";");
							const [nameValue = "", ...attrs] = parts.map((p) => p.trim());
							const eqIndex = nameValue.indexOf("=");

							let name = eqIndex > 0 ? nameValue.slice(0, eqIndex) : nameValue;
							const value = eqIndex > 0 ? nameValue.slice(eqIndex + 1) : "";

							// Remove __Secure- prefix
							if (!isSecureContext && name.includes(securePrefix)) {
								name = name.replace(securePrefix, prefix);
							}

							// Filter out Domain and Secure attributes
							const filteredAttrs = attrs.filter((attr) => {
								const lower = attr.toLowerCase();
								return !lower.startsWith("domain=") && lower !== "secure";
							});

							// Add Secure for HTTPS contexts
							if (isSecureContext) {
								filteredAttrs.push("Secure");
							}

							return filteredAttrs.length > 0
								? `${name}=${value}; ${filteredAttrs.join("; ")}`
								: `${name}=${value}`;
						});

					ctx.setHeader("set-cookie", processedCookies.join(", "));
					throw ctx.redirect(ctx.query.callbackURL);
				},
			),
		},
		hooks: {
			after: [
				{
					matcher(context) {
						return !!(
							context.path?.startsWith("/callback") ||
							context.path?.startsWith("/oauth2/callback")
						);
					},
					handler: createAuthMiddleware(async (ctx) => {
						const headers = ctx.context.responseHeaders;
						const location = headers?.get("location");

						if (
							!location?.includes("/oauth-proxy-callback?callbackURL") ||
							!location.startsWith("http")
						) {
							return;
						}

						const productionURL =
							opts?.productionURL ||
							ctx.context.options.baseURL ||
							ctx.context.baseURL;
						const productionOrigin = getOrigin(productionURL);

						const locationURL = new URL(location);
						const locationOrigin = locationURL.origin;

						//
						// Same origin: unwrap proxy redirect to original destination
						//
						if (locationOrigin === productionOrigin) {
							const newLocation = locationURL.searchParams.get("callbackURL");
							if (!newLocation) {
								return;
							}
							ctx.setHeader("location", newLocation);
							return;
						}

						//
						// Cross-origin: encrypt and forward cookies through proxy
						//
						const setCookies = headers?.get("set-cookie");
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
						ctx.setHeader("location", locationWithCookies);
					}),
				},
			],
			before: [
				{
					matcher() {
						return true;
					},
					handler: createAuthMiddleware(async (ctx) => {
						if (ctx.path !== "/callback/:id") {
							return;
						}

						const state = ctx.query?.state || ctx.body?.state;
						if (!state) {
							return;
						}

						const data =
							await ctx.context.internalAdapter.findVerificationValue(state);
						if (!data) {
							return;
						}

						let parsedState: { callbackURL?: string } | undefined;
						try {
							parsedState = parseJSON<{ callbackURL?: string }>(data.value);
						} catch {
							parsedState = undefined;
						}
						if (!parsedState?.callbackURL?.includes("/oauth-proxy-callback")) {
							return;
						}

						ctx.context.oauthConfig.skipStateCookieCheck = true;
					}),
				},
				{
					matcher(context) {
						return !!(
							context.path?.startsWith("/sign-in/social") ||
							context.path?.startsWith("/sign-in/oauth2")
						);
					},
					handler: createAuthMiddleware(async (ctx) => {
						if (!ctx.body) {
							return;
						}

						const skipProxy = checkSkipProxy(ctx);
						if (skipProxy) {
							return;
						}

						const currentURL = resolveCurrentURL(ctx);
						const originalCallbackURL =
							ctx.body.callbackURL || ctx.context.baseURL;
						const newCallbackURL = `${currentURL.origin}${
							ctx.context.options.basePath || "/api/auth"
						}/oauth-proxy-callback?callbackURL=${encodeURIComponent(
							originalCallbackURL,
						)}`;

						ctx.body.callbackURL = newCallbackURL;
					}),
				},
			],
		},
	} satisfies BetterAuthPlugin;
};
