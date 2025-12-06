import type { BetterAuthPlugin } from "@better-auth/core";
import {
	createAuthEndpoint,
	createAuthMiddleware,
} from "@better-auth/core/api";
import type { CookieOptions } from "better-call";
import * as z from "zod";
import { originCheck } from "../../api";
import { parseJSON } from "../../client/parser";
import { parseSetCookieHeader } from "../../cookies";
import { symmetricDecrypt, symmetricEncrypt } from "../../crypto";
import { getOrigin } from "../../utils/url";
import type { AuthContextWithSnapshot, OAuthProxyStatePackage } from "./types";
import { checkSkipProxy, resolveCurrentURL } from "./utils";

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
	/**
	 * Maximum age in seconds for the encrypted cookies payload.
	 * Payloads older than this will be rejected to prevent replay attacks.
	 *
	 * Keep this value short (e.g., 30-60 seconds) to minimize the window
	 * for potential replay attacks while still allowing normal OAuth flows.
	 *
	 * @default 60 (1 minute)
	 */
	maxAge?: number | undefined;
}

interface EncryptedCookiesPayload {
	cookies: string;
	timestamp: number;
}

const oAuthProxyQuerySchema = z.object({
	callbackURL: z.string().meta({
		description: "The URL to redirect to after the proxy",
	}),
	cookies: z.string().meta({
		description: "The cookies to set after the proxy",
	}),
});

export const oAuthProxy = (opts?: OAuthProxyOptions | undefined) => {
	const maxAge = opts?.maxAge ?? 60; // Default 60 seconds

	return {
		id: "oauth-proxy",
		options: opts,
		endpoints: {
			oAuthProxy: createAuthEndpoint(
				"/oauth-proxy-callback",
				{
					method: "GET",
					operationId: "oauthProxyCallback",
					query: oAuthProxyQuerySchema,
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
					let decryptedPayload: string | null = null;
					try {
						decryptedPayload = await symmetricDecrypt({
							key: ctx.context.secret,
							data: ctx.query.cookies,
						});
					} catch (e) {
						ctx.context.logger.error(
							"Failed to decrypt OAuth proxy cookies:",
							e,
						);
					}

					if (!decryptedPayload) {
						const errorURL =
							ctx.context.options.onAPIError?.errorURL ||
							`${ctx.context.options.baseURL}/api/auth/error`;

						throw ctx.redirect(
							`${errorURL}?error=OAuthProxy - Invalid cookies or secret`,
						);
					}

					let payload: EncryptedCookiesPayload;
					try {
						payload = parseJSON<EncryptedCookiesPayload>(decryptedPayload);
					} catch (e) {
						ctx.context.logger.error("Failed to parse OAuth proxy payload:", e);
						const errorURL =
							ctx.context.options.onAPIError?.errorURL ||
							`${ctx.context.options.baseURL}/api/auth/error`;

						throw ctx.redirect(
							`${errorURL}?error=OAuthProxy - Invalid payload format`,
						);
					}
					if (
						!payload.cookies ||
						typeof payload.cookies !== "string" ||
						typeof payload.timestamp !== "number"
					) {
						ctx.context.logger.error(
							"OAuth proxy payload missing required fields",
						);
						const errorURL =
							ctx.context.options.onAPIError?.errorURL ||
							`${ctx.context.options.baseURL}/api/auth/error`;

						throw ctx.redirect(
							`${errorURL}?error=OAuthProxy - Invalid payload structure`,
						);
					}

					const now = Date.now();
					const age = (now - payload.timestamp) / 1000;

					// Allow up to 10 seconds of future skew for clock differences
					if (age > maxAge || age < -10) {
						ctx.context.logger.error(
							`OAuth proxy payload expired or invalid (age: ${age}s, maxAge: ${maxAge}s)`,
						);
						const errorURL =
							ctx.context.options.onAPIError?.errorURL ||
							`${ctx.context.options.baseURL}/api/auth/error`;

						throw ctx.redirect(
							`${errorURL}?error=OAuthProxy - Payload expired or invalid`,
						);
					}

					const decryptedCookies = payload.cookies;

					const currentURL = resolveCurrentURL(ctx, opts);
					const isSecureContext = currentURL.protocol === "https:";

					const parsedCookies = parseSetCookieHeader(decryptedCookies);
					const processedCookies = Array.from(parsedCookies.entries()).map(
						([name, attrs]) => {
							const options: CookieOptions = {};
							if (attrs.path) {
								options.path = attrs.path;
							}
							if (attrs.expires) {
								options.expires = attrs.expires;
							}
							if (attrs.samesite) {
								options.sameSite = attrs.samesite;
							}
							if (attrs.httponly) {
								options.httpOnly = true;
							}
							if (attrs["max-age"] !== undefined) {
								options.maxAge = attrs["max-age"];
							}
							if (isSecureContext) {
								options.secure = true;
							}

							return {
								name,
								options,
								/**
								 * URI-decoded value because `ctx.setCookie` will URI-encode it again
								 */
								value: decodeURIComponent(attrs.value),
							};
						},
					);

					for (const cookie of processedCookies) {
						// using `ctx.setHeader` overrides previous Set-Cookie headers
						// so use ctx.setCookie helper instead
						// https://github.com/Bekacru/better-call/blob/d27ac20e64b329a4851e97adf864098a9bc2a260/src/context.ts#L217
						ctx.setCookie(cookie.name, cookie.value, cookie.options);
					}
					throw ctx.redirect(ctx.query.callbackURL);
				},
			),
		},
		hooks: {
			before: [
				{
					matcher(context) {
						return !!(
							context.path?.startsWith("/sign-in/social") ||
							context.path?.startsWith("/sign-in/oauth2")
						);
					},
					handler: createAuthMiddleware(async (ctx) => {
						const skipProxy = checkSkipProxy(ctx, opts);
						if (skipProxy) {
							return;
						}

						const currentURL = resolveCurrentURL(ctx, opts);
						const originalCallbackURL =
							ctx.body?.callbackURL || ctx.context.baseURL;

						// Construct proxy callback URL
						const newCallbackURL = `${currentURL.origin}${
							ctx.context.options.basePath || "/api/auth"
						}/oauth-proxy-callback?callbackURL=${encodeURIComponent(
							originalCallbackURL,
						)}`;

						if (!ctx.body) {
							return;
						}

						ctx.body.callbackURL = newCallbackURL;
					}),
				},
				{
					matcher(context) {
						return !!(
							context.path?.startsWith("/callback") ||
							context.path?.startsWith("/oauth2/callback")
						);
					},
					handler: createAuthMiddleware(async (ctx) => {
						const state = ctx.query?.state || ctx.body?.state;
						if (!state || typeof state !== "string") {
							return;
						}

						// Try to decrypt and parse OAuth proxy state package
						let statePackage: OAuthProxyStatePackage | undefined;
						try {
							const decryptedPackage = await symmetricDecrypt({
								key: ctx.context.secret,
								data: state,
							});
							statePackage =
								parseJSON<OAuthProxyStatePackage>(decryptedPackage);
						} catch (e) {
							// Not an OAuth proxy state, continue normally
							return;
						}

						if (
							!statePackage.isOAuthProxy ||
							!statePackage.state ||
							!statePackage.stateCookie
						) {
							return;
						}

						// Decrypt the state cookie content
						let stateCookieValue: string;
						try {
							stateCookieValue = await symmetricDecrypt({
								key: ctx.context.secret,
								data: statePackage.stateCookie,
							});
							parseJSON(stateCookieValue);
						} catch (e) {
							ctx.context.logger.error(
								"Failed to decrypt OAuth proxy state cookie:",
								e,
							);
							return;
						}

						// Snapshot original configuration for restoration in after hook
						(ctx.context as AuthContextWithSnapshot)._oauthProxySnapshot = {
							storeStateStrategy: ctx.context.oauthConfig.storeStateStrategy,
							skipStateCookieCheck:
								ctx.context.oauthConfig.skipStateCookieCheck,
							internalAdapter: ctx.context.internalAdapter,
						};

						// Temporarily switch to database mode and inject verification value
						// This allows the OAuth callback handler to retrieve state data without database
						const originalAdapter = ctx.context.internalAdapter;
						const capturedStatePackage = statePackage;
						ctx.context.oauthConfig.storeStateStrategy = "database";
						ctx.context.internalAdapter = {
							...ctx.context.internalAdapter,
							findVerificationValue: async (identifier: string) => {
								if (identifier === capturedStatePackage.state) {
									return {
										id: `oauth-proxy-${capturedStatePackage.state}`,
										identifier: capturedStatePackage.state,
										value: stateCookieValue,
										createdAt: new Date(),
										updatedAt: new Date(),
										// Align expiration time with `generateState` in oauth2
										expiresAt: new Date(Date.now() + 10 * 60 * 1000),
									};
								}
								return originalAdapter.findVerificationValue(identifier);
							},
						};

						// Restore original state parameter
						if (ctx.query?.state) {
							ctx.query.state = statePackage.state;
						}
						if (ctx.body?.state) {
							ctx.body.state = statePackage.state;
						}

						// Enable skipStateCookieCheck for database mode
						ctx.context.oauthConfig.skipStateCookieCheck = true;
					}),
				},
				{
					matcher() {
						return true;
					},
					handler: createAuthMiddleware(async (ctx) => {
						if (ctx.path !== "/callback/:id") {
							return;
						}
						if (ctx.context.oauthConfig.storeStateStrategy === "cookie") {
							return;
						}

						// Skip if OAuth proxy stateless flow already handled by previous hook
						if ((ctx.context as AuthContextWithSnapshot)._oauthProxySnapshot) {
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

						// Snapshot original configuration for restoration in after hook
						(ctx.context as AuthContextWithSnapshot)._oauthProxySnapshot = {
							storeStateStrategy: ctx.context.oauthConfig.storeStateStrategy,
							skipStateCookieCheck:
								ctx.context.oauthConfig.skipStateCookieCheck,
							internalAdapter: ctx.context.internalAdapter,
						};

						ctx.context.oauthConfig.skipStateCookieCheck = true;
					}),
				},
			],
			after: [
				{
					matcher(context) {
						return !!(
							context.path?.startsWith("/sign-in/social") ||
							context.path?.startsWith("/sign-in/oauth2")
						);
					},
					handler: createAuthMiddleware(async (ctx) => {
						const skipProxy = checkSkipProxy(ctx, opts);
						if (skipProxy) {
							return;
						}

						// Only process in stateless mode
						if (ctx.context.oauthConfig.storeStateStrategy !== "cookie") {
							return;
						}

						// Extract OAuth provider URL from sign-in response
						const signInResponse = ctx.context.returned;
						if (
							!signInResponse ||
							typeof signInResponse !== "object" ||
							!("url" in signInResponse)
						) {
							return;
						}

						const { url: providerURL } = signInResponse;
						if (typeof providerURL !== "string") {
							return;
						}

						// Parse provider URL and extract state parameter
						const oauthURL = new URL(providerURL);
						const originalState = oauthURL.searchParams.get("state");
						if (!originalState) {
							return;
						}

						// Extract state cookie from response headers
						const headers = ctx.context.responseHeaders;
						const setCookieHeader = headers?.get("set-cookie");
						if (!setCookieHeader) {
							return;
						}

						const stateCookie = ctx.context.createAuthCookie("oauth_state");
						const parsedStateCookies = parseSetCookieHeader(setCookieHeader);
						const stateCookieAttrs = parsedStateCookies.get(stateCookie.name);
						if (!stateCookieAttrs?.value) {
							return;
						}

						const stateCookieValue = stateCookieAttrs.value;

						try {
							// Create and encrypt state package
							const statePackage: OAuthProxyStatePackage = {
								state: originalState,
								stateCookie: stateCookieValue,
								isOAuthProxy: true,
							};
							const encryptedPackage = await symmetricEncrypt({
								key: ctx.context.secret,
								data: JSON.stringify(statePackage),
							});

							// Replace state parameter with encrypted package
							oauthURL.searchParams.set("state", encryptedPackage);

							// Update response with modified URL
							ctx.context.returned = {
								...signInResponse,
								url: oauthURL.toString(),
							};
						} catch (e) {
							ctx.context.logger.error(
								"Failed to encrypt OAuth proxy state package:",
								e,
							);
							// Continue without proxy
						}
					}),
				},
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

						// Create payload with timestamp for replay attack protection
						const payload: EncryptedCookiesPayload = {
							cookies: setCookies,
							timestamp: Date.now(),
						};

						const encryptedCookies = await symmetricEncrypt({
							key: ctx.context.secret,
							data: JSON.stringify(payload),
						});
						const locationWithCookies = `${location}&cookies=${encodeURIComponent(
							encryptedCookies,
						)}`;

						ctx.setHeader("location", locationWithCookies);
						return;
					}),
				},
				{
					// Restore OAuth config after processing callback
					matcher(context) {
						return !!(
							context.path?.startsWith("/callback") ||
							context.path?.startsWith("/oauth2/callback")
						);
					},
					handler: createAuthMiddleware(async (ctx) => {
						const contextWithSnapshot = ctx.context as AuthContextWithSnapshot;
						const snapshot = contextWithSnapshot._oauthProxySnapshot;
						if (snapshot) {
							ctx.context.oauthConfig.storeStateStrategy =
								snapshot.storeStateStrategy;
							ctx.context.oauthConfig.skipStateCookieCheck =
								snapshot.skipStateCookieCheck;
							ctx.context.internalAdapter = snapshot.internalAdapter;

							// Clear the temporary extended context value
							contextWithSnapshot._oauthProxySnapshot = undefined;
						}
					}),
				},
			],
		},
	} satisfies BetterAuthPlugin;
};
