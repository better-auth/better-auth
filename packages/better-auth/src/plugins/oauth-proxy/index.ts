import type { BetterAuthPlugin } from "@better-auth/core";
import {
	createAuthEndpoint,
	createAuthMiddleware,
} from "@better-auth/core/api";
import type { OAuth2Tokens } from "@better-auth/core/oauth2";
import * as z from "zod";
import { originCheck } from "../../api";
import { parseJSON } from "../../client/parser";
import { setSessionCookie } from "../../cookies";
import { parseSetCookieHeader } from "../../cookies/cookie-utils";
import { symmetricDecrypt, symmetricEncrypt } from "../../crypto";
import { handleOAuthUserInfo } from "../../oauth2/link-account";
import type { StateData } from "../../state";
import type { Account, User } from "../../types";
import { getOrigin } from "../../utils/url";
import type { OAuthProxyStatePackage } from "./types";
import { checkSkipProxy, resolveCurrentURL, stripTrailingSlash } from "./utils";

declare module "@better-auth/core" {
	interface BetterAuthPluginRegistry<AuthOptions, Options> {
		"oauth-proxy": {
			creator: typeof oAuthProxy;
		};
	}
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
	/**
	 * Maximum age in seconds for the encrypted payload.
	 * Payloads older than this will be rejected to prevent replay attacks.
	 *
	 * Keep this value short (e.g., 30-60 seconds) to minimize the window
	 * for potential replay attacks while still allowing normal OAuth flows.
	 *
	 * @default 60 (1 minute)
	 */
	maxAge?: number | undefined;
}

/**
 * Passthrough payload containing OAuth profile data.
 * Used to transfer OAuth credentials from production to preview
 * without creating user/session on production.
 */
interface PassthroughPayload {
	userInfo: Omit<User, "createdAt" | "updatedAt">;
	account: Omit<Account, "id" | "userId" | "createdAt" | "updatedAt">;
	callbackURL: string;
	newUserURL?: string;
	errorURL?: string;
	disableSignUp?: boolean;
	timestamp: number;
}

const oAuthProxyQuerySchema = z.object({
	callbackURL: z.string().meta({
		description: "The URL to redirect to after the proxy",
	}),
	profile: z.string().optional().meta({
		description: "Encrypted OAuth profile data (passthrough mode)",
	}),
});

export const oAuthProxy = <O extends OAuthProxyOptions>(opts?: O) => {
	const maxAge = opts?.maxAge ?? 60; // Default 60 seconds

	return {
		id: "oauth-proxy",
		options: opts as NoInfer<O>,
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
									name: "profile",
									required: false,
									description:
										"Encrypted OAuth profile data (passthrough mode)",
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
					const encryptedProfile = ctx.query.profile;

					if (!encryptedProfile) {
						ctx.context.logger.error(
							"OAuth proxy callback missing profile data",
						);
						const errorURL =
							ctx.context.options.onAPIError?.errorURL ||
							`${stripTrailingSlash(ctx.context.options.baseURL)}/api/auth/error`;

						throw ctx.redirect(
							`${errorURL}?error=OAuthProxy - Missing profile data`,
						);
					}

					// Decrypt profile payload
					let decryptedPayload: string;
					try {
						decryptedPayload = await symmetricDecrypt({
							key: ctx.context.secret,
							data: encryptedProfile,
						});
					} catch (e) {
						ctx.context.logger.error(
							"Failed to decrypt OAuth proxy profile:",
							e,
						);
						const errorURL =
							ctx.context.options.onAPIError?.errorURL ||
							`${stripTrailingSlash(ctx.context.options.baseURL)}/api/auth/error`;

						throw ctx.redirect(
							`${errorURL}?error=OAuthProxy - Invalid profile or secret mismatch`,
						);
					}

					let payload: PassthroughPayload;
					try {
						payload = parseJSON<PassthroughPayload>(decryptedPayload);
					} catch (e) {
						ctx.context.logger.error("Failed to parse OAuth proxy payload:", e);
						const errorURL =
							ctx.context.options.onAPIError?.errorURL ||
							`${stripTrailingSlash(ctx.context.options.baseURL)}/api/auth/error`;

						throw ctx.redirect(
							`${errorURL}?error=OAuthProxy - Invalid payload format`,
						);
					}

					// Validate timestamp to prevent replay attacks
					const now = Date.now();
					const age = (now - payload.timestamp) / 1000;

					// Allow up to 10 seconds of future skew for clock differences
					if (age > maxAge || age < -10) {
						ctx.context.logger.error(
							`OAuth proxy payload expired or invalid (age: ${age}s, maxAge: ${maxAge}s)`,
						);
						const errorURL =
							ctx.context.options.onAPIError?.errorURL ||
							`${stripTrailingSlash(ctx.context.options.baseURL)}/api/auth/error`;

						throw ctx.redirect(
							`${errorURL}?error=OAuthProxy - Payload expired or invalid`,
						);
					}

					const errorURL =
						payload.errorURL ||
						ctx.context.options.onAPIError?.errorURL ||
						`${stripTrailingSlash(ctx.context.options.baseURL)}/api/auth/error`;

					// Create user/account/session locally using handleOAuthUserInfo
					const result = await handleOAuthUserInfo(ctx, {
						userInfo: payload.userInfo,
						account: payload.account,
						callbackURL: payload.callbackURL,
						disableSignUp: payload.disableSignUp,
					});

					if (result.error) {
						ctx.context.logger.error(
							"OAuth proxy user creation failed:",
							result.error,
						);
						throw ctx.redirect(
							`${errorURL}?error=${result.error.split(" ").join("_")}`,
						);
					}

					// Set session cookie
					await setSessionCookie(ctx, result.data!);

					// Redirect to final callback URL
					const finalURL = result.isRegister
						? payload.newUserURL || payload.callbackURL
						: payload.callbackURL;

					throw ctx.redirect(finalURL);
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
						const productionURL = opts?.productionURL;
						const originalCallbackURL =
							ctx.body?.callbackURL || ctx.context.baseURL;

						// Override baseURL to production so redirect_uri points to production
						// This ensures OAuth provider callbacks go to the production server
						if (productionURL) {
							const productionBaseURL = `${stripTrailingSlash(productionURL)}${ctx.context.options.basePath || "/api/auth"}`;
							ctx.context.baseURL = productionBaseURL;
						}

						// Construct proxy callback URL
						const newCallbackURL = `${stripTrailingSlash(currentURL.origin)}${
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
					// Intercept OAuth callback on production to handle passthrough
					matcher(context) {
						return context.path === "/callback/:id";
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
						} catch {
							// Not an OAuth proxy state, continue normally
							return;
						}

						if (
							!statePackage?.isOAuthProxy ||
							!statePackage?.state ||
							!statePackage?.stateCookie
						) {
							return;
						}

						// This is an OAuth proxy callback - handle passthrough
						// Instead of letting the normal callback create user/session,
						// we do token exchange here and redirect to preview with profile data

						const code = ctx.query?.code;
						const error = ctx.query?.error;
						const errorDescription = ctx.query?.error_description;

						// Decrypt state to get codeVerifier and callbackURL
						let stateData: StateData;
						try {
							const decryptedState = await symmetricDecrypt({
								key: ctx.context.secret,
								data: statePackage.stateCookie,
							});
							stateData = parseJSON<StateData>(decryptedState);
						} catch (e) {
							ctx.context.logger.error(
								"Failed to decrypt OAuth proxy state cookie:",
								e,
							);
							return;
						}

						const defaultErrorURL =
							stateData.errorURL ||
							ctx.context.options.onAPIError?.errorURL ||
							`${ctx.context.baseURL}/error`;

						// Handle OAuth provider errors
						if (error) {
							const params = new URLSearchParams({ error });
							if (errorDescription) {
								params.set("error_description", errorDescription);
							}
							throw ctx.redirect(`${defaultErrorURL}?${params.toString()}`);
						}

						if (!code || typeof code !== "string") {
							ctx.context.logger.error("OAuth proxy: code not found");
							throw ctx.redirect(`${defaultErrorURL}?error=no_code`);
						}

						// Find the OAuth provider
						const providerId = ctx.params?.id;
						const provider = ctx.context.socialProviders.find(
							(p) => p.id === providerId,
						);

						if (!provider) {
							ctx.context.logger.error("OAuth provider not found:", providerId);
							throw ctx.redirect(
								`${defaultErrorURL}?error=oauth_provider_not_found`,
							);
						}

						// Exchange code for tokens
						let tokens: OAuth2Tokens | null;
						try {
							tokens = await provider.validateAuthorizationCode({
								code,
								codeVerifier: stateData.codeVerifier,
								redirectURI: `${ctx.context.baseURL}/callback/${provider.id}`,
							});
						} catch (e) {
							ctx.context.logger.error(
								"OAuth proxy: failed to validate authorization code:",
								e,
							);
							throw ctx.redirect(`${defaultErrorURL}?error=invalid_code`);
						}

						if (!tokens) {
							throw ctx.redirect(`${defaultErrorURL}?error=invalid_code`);
						}

						// Get user info from provider
						const userInfoResult = await provider.getUserInfo(tokens);
						const userInfo = userInfoResult?.user;

						if (!userInfo) {
							ctx.context.logger.error("OAuth proxy: unable to get user info");
							throw ctx.redirect(
								`${defaultErrorURL}?error=unable_to_get_user_info`,
							);
						}

						if (!userInfo.email) {
							ctx.context.logger.error(
								"OAuth proxy: provider did not return email",
							);
							throw ctx.redirect(`${defaultErrorURL}?error=email_not_found`);
						}

						// The stateData.callbackURL is the proxy callback URL:
						// http://preview.example.com/api/auth/oauth-proxy-callback?callbackURL=<finalURL>
						// Extract the final callbackURL from the query parameter
						const proxyCallbackURL = new URL(stateData.callbackURL);
						const finalCallbackURL =
							proxyCallbackURL.searchParams.get("callbackURL") ||
							stateData.callbackURL;

						// Create passthrough payload with OAuth profile data
						const payload: PassthroughPayload = {
							userInfo: {
								id: String(userInfo.id),
								email: userInfo.email,
								name: userInfo.name,
								image: userInfo.image,
								emailVerified: userInfo.emailVerified,
							},
							account: {
								providerId: provider.id,
								accountId: String(userInfo.id),
								accessToken: tokens.accessToken,
								refreshToken: tokens.refreshToken,
								idToken: tokens.idToken,
								accessTokenExpiresAt: tokens.accessTokenExpiresAt,
								refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
								scope: tokens.scopes?.join(","),
							},
							callbackURL: finalCallbackURL,
							newUserURL: stateData.newUserURL,
							errorURL: stateData.errorURL,
							disableSignUp:
								(provider.disableImplicitSignUp && !stateData.requestSignUp) ||
								provider.options?.disableSignUp,
							timestamp: Date.now(),
						};

						// Encrypt the payload
						const encryptedPayload = await symmetricEncrypt({
							key: ctx.context.secret,
							data: JSON.stringify(payload),
						});

						// Add the profile parameter to proxy callback URL
						proxyCallbackURL.searchParams.set("profile", encryptedPayload);

						// Redirect to preview's oauth-proxy-callback with profile data
						throw ctx.redirect(proxyCallbackURL.toString());
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

						// Get state value based on storage strategy
						let stateCookieValue: string | undefined;

						if (ctx.context.oauthConfig.storeStateStrategy === "cookie") {
							// Cookie mode: extract from response headers
							const headers = ctx.context.responseHeaders;
							const setCookieHeader = headers?.get("set-cookie");
							if (setCookieHeader) {
								const parsedCookies = parseSetCookieHeader(setCookieHeader);
								const stateCookie = ctx.context.createAuthCookie("oauth_state");
								const stateCookieAttrs = parsedCookies.get(stateCookie.name);
								stateCookieValue = stateCookieAttrs?.value;
							}
						} else {
							// Database mode: read from DB
							const verification =
								await ctx.context.internalAdapter.findVerificationValue(
									originalState,
								);
							if (verification) {
								// Encrypt the verification value so it matches cookie mode format
								stateCookieValue = await symmetricEncrypt({
									key: ctx.context.secret,
									data: verification.value,
								});
							}
						}

						if (!stateCookieValue) {
							return;
						}

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
						return context.path === "/callback/:id";
					},
					handler: createAuthMiddleware(async (ctx) => {
						// This after hook handles same-origin callbacks
						// For cross-origin, the before hook already redirected with passthrough

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

						// Same origin: unwrap proxy redirect to original destination
						if (locationOrigin === productionOrigin) {
							const newLocation = locationURL.searchParams.get("callbackURL");
							if (!newLocation) {
								return;
							}
							ctx.setHeader("location", newLocation);
							return;
						}

						// Cross-origin should have been handled by before hook (passthrough)
						// If we reach here, something unexpected happened
						ctx.context.logger.warn(
							"OAuth proxy: cross-origin callback reached after hook unexpectedly",
						);
					}),
				},
			],
		},
	} satisfies BetterAuthPlugin;
};
