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
import { parseGenericState } from "../../state";
import type { Account, User } from "../../types";
import { getOrigin } from "../../utils/url";
import { OAUTH_PROXY_ERROR_CODES } from "./error-codes";
import type { OAuthProxyStatePackage } from "./types";
import {
	checkSkipProxy,
	redirectOnError,
	resolveCurrentURL,
	stripTrailingSlash,
} from "./utils";

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
 * @internal
 */
interface PassthroughPayload {
	userInfo: Omit<User, "createdAt" | "updatedAt">;
	account: Omit<Account, "id" | "userId" | "createdAt" | "updatedAt">;
	state: string;
	callbackURL: string;
	newUserURL?: string;
	errorURL?: string;
	disableSignUp?: boolean;
	timestamp: number;
}

const oauthProxyQuerySchema = z.object({
	callbackURL: z.string().meta({
		description: "The URL to redirect to after the proxy",
	}),
	profile: z.string().optional().meta({
		description: "Encrypted OAuth profile data",
	}),
});

const oauthCallbackQuerySchema = z.object({
	code: z.string().optional(),
	error: z.string().optional(),
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
					query: oauthProxyQuerySchema,
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
									description: "Encrypted OAuth profile data",
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
					const defaultErrorURL =
						ctx.context.options.onAPIError?.errorURL ||
						`${stripTrailingSlash(ctx.context.options.baseURL)}/api/auth/error`;

					const encryptedProfile = ctx.query.profile;
					if (!encryptedProfile) {
						ctx.context.logger.error(
							OAUTH_PROXY_ERROR_CODES.MISSING_PROFILE.message,
						);
						throw redirectOnError(
							ctx,
							defaultErrorURL,
							OAUTH_PROXY_ERROR_CODES.MISSING_PROFILE.code,
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
							OAUTH_PROXY_ERROR_CODES.INVALID_PROFILE.message,
							e,
						);
						throw redirectOnError(
							ctx,
							defaultErrorURL,
							OAUTH_PROXY_ERROR_CODES.INVALID_PROFILE.code,
						);
					}

					let payload: PassthroughPayload;
					try {
						payload = parseJSON<PassthroughPayload>(decryptedPayload);
					} catch (e) {
						ctx.context.logger.error(
							OAUTH_PROXY_ERROR_CODES.INVALID_PAYLOAD.message,
							e,
						);
						throw redirectOnError(
							ctx,
							defaultErrorURL,
							OAUTH_PROXY_ERROR_CODES.INVALID_PAYLOAD.code,
						);
					}

					const errorURL = payload.errorURL || defaultErrorURL;

					// Allow up to 10 seconds of future skew for clock skew
					const now = Date.now();
					const age = (now - payload.timestamp) / 1000;
					if (age > maxAge || age < -10) {
						ctx.context.logger.error(
							`${OAUTH_PROXY_ERROR_CODES.PAYLOAD_EXPIRED.message} (age: ${age}s, maxAge: ${maxAge}s)`,
						);
						throw redirectOnError(
							ctx,
							errorURL,
							OAUTH_PROXY_ERROR_CODES.PAYLOAD_EXPIRED.code,
						);
					}

					const result = await handleOAuthUserInfo(ctx, {
						userInfo: payload.userInfo,
						account: payload.account,
						callbackURL: payload.callbackURL,
						disableSignUp: payload.disableSignUp,
					});
					if (result.error || !result.data) {
						ctx.context.logger.error(
							OAUTH_PROXY_ERROR_CODES.USER_CREATION_FAILED.message,
							result.error,
						);
						throw redirectOnError(
							ctx,
							errorURL,
							OAUTH_PROXY_ERROR_CODES.USER_CREATION_FAILED.code,
						);
					}

					await setSessionCookie(ctx, result.data);

					try {
						await parseGenericState(ctx, payload.state);
					} catch (e) {
						ctx.context.logger.warn("Failed to clean up OAuth state", e);
					}

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
							!statePackage.isOAuthProxy ||
							!statePackage.state ||
							!statePackage.stateCookie
						) {
							ctx.context.logger.warn("Invalid OAuth proxy state package");
							return;
						}

						const query = oauthCallbackQuerySchema.safeParse(ctx.query);
						if (!query.success) {
							ctx.context.logger.warn(
								"Invalid OAuth callback query",
								query.error,
							);
							return;
						}
						const { code, error } = query.data;

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

						const errorURL =
							stateData.errorURL ||
							ctx.context.options.onAPIError?.errorURL ||
							`${ctx.context.baseURL}/error`;
						if (error) {
							throw redirectOnError(ctx, errorURL, error);
						}

						if (!code) {
							ctx.context.logger.error(OAUTH_PROXY_ERROR_CODES.NO_CODE.message);
							throw redirectOnError(
								ctx,
								errorURL,
								OAUTH_PROXY_ERROR_CODES.NO_CODE.code,
							);
						}

						// Find the OAuth provider
						const providerId = ctx.params?.id;
						const provider = ctx.context.socialProviders.find(
							(p) => p.id === providerId,
						);
						if (!provider) {
							ctx.context.logger.error(
								OAUTH_PROXY_ERROR_CODES.PROVIDER_NOT_FOUND.message,
								providerId,
							);
							throw redirectOnError(
								ctx,
								errorURL,
								OAUTH_PROXY_ERROR_CODES.PROVIDER_NOT_FOUND.code,
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
								OAUTH_PROXY_ERROR_CODES.INVALID_CODE.message,
								e,
							);
							throw redirectOnError(
								ctx,
								errorURL,
								OAUTH_PROXY_ERROR_CODES.INVALID_CODE.code,
							);
						}

						if (!tokens) {
							throw redirectOnError(
								ctx,
								errorURL,
								OAUTH_PROXY_ERROR_CODES.INVALID_CODE.code,
							);
						}

						// Get user info from provider
						const userInfoResult = await provider.getUserInfo(tokens);
						const userInfo = userInfoResult?.user;

						if (!userInfo) {
							ctx.context.logger.error(
								OAUTH_PROXY_ERROR_CODES.UNABLE_TO_GET_USER_INFO.message,
							);
							throw redirectOnError(
								ctx,
								errorURL,
								OAUTH_PROXY_ERROR_CODES.UNABLE_TO_GET_USER_INFO.code,
							);
						}

						if (!userInfo.email) {
							ctx.context.logger.error(
								OAUTH_PROXY_ERROR_CODES.EMAIL_NOT_FOUND.message,
							);
							throw redirectOnError(
								ctx,
								errorURL,
								OAUTH_PROXY_ERROR_CODES.EMAIL_NOT_FOUND.code,
							);
						}

						const proxyCallbackURL = new URL(stateData.callbackURL);
						const finalCallbackURL =
							proxyCallbackURL.searchParams.get("callbackURL") ||
							stateData.callbackURL;

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
							state: statePackage.state,
							callbackURL: finalCallbackURL,
							newUserURL: stateData.newUserURL,
							errorURL: stateData.errorURL,
							disableSignUp:
								(provider.disableImplicitSignUp && !stateData.requestSignUp) ||
								provider.options?.disableSignUp,
							timestamp: Date.now(),
						};

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
							// Cookie mode - extract from response headers
							const headers = ctx.context.responseHeaders;
							const setCookieHeader = headers?.get("set-cookie");
							if (setCookieHeader) {
								const parsedCookies = parseSetCookieHeader(setCookieHeader);
								const stateCookie = ctx.context.createAuthCookie("oauth_state");
								const stateCookieAttrs = parsedCookies.get(stateCookie.name);
								stateCookieValue = stateCookieAttrs?.value;
							}
						} else {
							// Database mode - read from DB
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
							ctx.context.logger.warn("No OAuth state cookie value found");
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

						// Cross-origin should have been handled by before hook
						ctx.context.logger.warn(
							"OAuth proxy: cross-origin callback reached after hook unexpectedly",
						);
					}),
				},
			],
		},
		$ERROR_CODES: OAUTH_PROXY_ERROR_CODES,
	} satisfies BetterAuthPlugin;
};
