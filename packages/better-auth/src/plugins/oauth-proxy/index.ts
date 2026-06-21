import type {
	BetterAuthPlugin,
	GenericEndpointContext,
	SecretConfig,
} from "@better-auth/core";
import {
	createAuthEndpoint,
	createAuthMiddleware,
} from "@better-auth/core/api";
import type { OAuth2Tokens } from "@better-auth/core/oauth2";
import { defu } from "defu";
import * as z from "zod";
import { originCheck } from "../../api";
import { parseJSON } from "../../client/parser";
import { setSessionCookie } from "../../cookies";
import { parseSetCookieHeader } from "../../cookies/cookie-utils";
import { symmetricDecrypt, symmetricEncrypt } from "../../crypto";
import { redirectOnError } from "../../oauth2/errors";
import { handleOAuthUserInfo } from "../../oauth2/link-account";
import type { StateData } from "../../state";
import { parseGenericState } from "../../state";
import type { Account, User } from "../../types";
import { isAPIError } from "../../utils/is-api-error";
import { getOrigin } from "../../utils/url";
import { PACKAGE_VERSION } from "../../version";
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
	/**
	 * A dedicated secret used to encrypt and decrypt data passed between
	 * servers during the OAuth proxy flow.
	 *
	 * When set, this secret is used **instead of** the global
	 * `BETTER_AUTH_SECRET` for all OAuth proxy encryption operations.
	 * This limits the blast radius if the secret is shared across
	 * environments (production, preview, development): a leaked proxy
	 * secret cannot be used to forge sessions or decrypt other data
	 * protected by the main secret.
	 *
	 * All environments participating in the OAuth proxy flow must share
	 * the same `secret` value.
	 */
	secret?: string | SecretConfig | undefined;
}

/**
 * Encrypted state package for cross-origin OAuth proxy flow
 * @internal
 */
type OAuthProxyStatePackage = {
	state: string;
	/**
	 * The OAuth state, encrypted under the proxy key (`getEncryptionKey`), not
	 * the per-environment `oauth_state` cookie key. Production decrypts it with
	 * the same proxy key, so both state strategies must produce it that way.
	 */
	stateCookie: string;
	isOAuthProxy: boolean;
};

/**
 * Passthrough payload containing OAuth profile data.
 * Used to transfer OAuth credentials from production to preview
 * without creating user/session on production.
 * @internal
 */
type PassthroughPayload = {
	userInfo: Omit<User, "createdAt" | "updatedAt">;
	account: Omit<Account, "id" | "userId" | "createdAt" | "updatedAt">;
	state: string;
	callbackURL: string;
	newUserURL?: string;
	errorURL?: string;
	disableSignUp?: boolean;
	timestamp: number;
};

const consumeOAuthProxyState = async (
	ctx: GenericEndpointContext,
	state: string,
) => {
	try {
		await parseGenericState(ctx, state, {
			skipStateCookieCheck: true,
		});
		return true;
	} catch (e) {
		ctx.context.logger.warn("OAuth proxy state missing or invalid", e);
		return false;
	}
};

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
	const getEncryptionKey = (
		ctx: GenericEndpointContext,
	): string | SecretConfig => opts?.secret ?? ctx.context.secretConfig;

	return {
		id: "oauth-proxy",
		version: PACKAGE_VERSION,
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
					const baseURLStr =
						typeof ctx.context.options.baseURL === "string"
							? ctx.context.options.baseURL
							: getOrigin(ctx.context.baseURL) || "";
					const defaultErrorURL =
						ctx.context.options.onAPIError?.errorURL ||
						`${stripTrailingSlash(baseURLStr)}/api/auth/error`;

					const encryptedProfile = ctx.query.profile;
					if (!encryptedProfile) {
						ctx.context.logger.error(
							"OAuth proxy callback missing profile data",
						);
						throw redirectOnError(ctx, defaultErrorURL, "missing_profile");
					}

					// Decrypt profile payload
					let decryptedPayload: string;
					try {
						decryptedPayload = await symmetricDecrypt({
							key: getEncryptionKey(ctx),
							data: encryptedProfile,
						});
					} catch (e) {
						ctx.context.logger.error(
							"Failed to decrypt OAuth proxy profile",
							e,
						);
						throw redirectOnError(ctx, defaultErrorURL, "invalid_profile");
					}

					let payload: PassthroughPayload;
					try {
						payload = parseJSON<PassthroughPayload>(decryptedPayload);
					} catch (e) {
						ctx.context.logger.error("Failed to parse OAuth proxy payload", e);
						throw redirectOnError(ctx, defaultErrorURL, "invalid_payload");
					}

					// Validate required payload fields
					if (
						typeof payload.timestamp !== "number" ||
						!payload.userInfo ||
						!payload.account ||
						!payload.state ||
						!payload.callbackURL
					) {
						ctx.context.logger.error("Failed to parse OAuth proxy payload");
						throw redirectOnError(ctx, defaultErrorURL, "invalid_payload");
					}

					const errorURL = payload.errorURL || defaultErrorURL;

					// Allow up to 10 seconds of future skew for clock skew
					const now = Date.now();
					const age = (now - payload.timestamp) / 1000;
					if (age > maxAge || age < -10) {
						ctx.context.logger.error(
							`OAuth proxy payload expired or invalid (age: ${age}s, maxAge: ${maxAge}s)`,
						);
						throw redirectOnError(ctx, errorURL, "payload_expired");
					}

					const stateConsumed = await consumeOAuthProxyState(
						ctx,
						payload.state,
					);
					if (!stateConsumed) {
						throw redirectOnError(ctx, errorURL, "state_mismatch");
					}

					let result: Awaited<ReturnType<typeof handleOAuthUserInfo>>;
					try {
						result = await handleOAuthUserInfo(ctx, {
							userInfo: payload.userInfo,
							account: payload.account,
							callbackURL: payload.callbackURL,
							disableSignUp: payload.disableSignUp,
						});
					} catch (e) {
						if (isAPIError(e) && e.body?.code) {
							throw redirectOnError(ctx, errorURL, e.body.code, e.body.message);
						}
						throw e;
					}
					if (result.error) {
						ctx.context.logger.error(
							"OAuth proxy callback error",
							result.error,
						);
						throw redirectOnError(
							ctx,
							errorURL,
							result.error.split(" ").join("_"),
						);
					}
					if (!result.data) {
						ctx.context.logger.error(
							"OAuth proxy callback missing session data",
						);
						throw redirectOnError(ctx, errorURL, "user_creation_failed");
					}

					await setSessionCookie(ctx, result.data);

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
						// Query takes precedence over body (matches callbackOAuth behavior)
						const callbackParams = defu(ctx.query, ctx.body);

						const state = callbackParams.state;
						if (!state || typeof state !== "string") {
							return;
						}

						// Try to decrypt and parse OAuth proxy state package
						let statePackage: OAuthProxyStatePackage | undefined;
						try {
							const decryptedPackage = await symmetricDecrypt({
								key: getEncryptionKey(ctx),
								data: state,
							});
							statePackage =
								parseJSON<OAuthProxyStatePackage>(decryptedPackage);
						} catch {
							// State is either a regular (non-proxy) state, or an encrypted proxy
							// package that can't be decrypted (e.g. different secrets on preview vs production).
							// If you're using oauth-proxy and seeing state_mismatch errors, ensure all
							// environments share the same `secret` in the oAuthProxy plugin options.
							ctx.context.logger.debug(
								"OAuth proxy: could not decrypt state package, falling back to regular callback",
							);
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

						const query = oauthCallbackQuerySchema.safeParse(callbackParams);
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
								key: getEncryptionKey(ctx),
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

						if (
							stateData.oauthState !== undefined &&
							stateData.oauthState !== statePackage.state
						) {
							ctx.context.logger.error("OAuth proxy state binding mismatch");
							throw redirectOnError(ctx, errorURL, "state_mismatch");
						}

						if (error) {
							throw redirectOnError(ctx, errorURL, error);
						}

						if (!code) {
							ctx.context.logger.warn(
								"OAuth callback missing authorization code",
							);
							throw redirectOnError(ctx, errorURL, "no_code");
						}

						// Find the OAuth provider
						const providerId = ctx.params?.id;
						const provider = ctx.context.socialProviders.find(
							(p) => p.id === providerId,
						);
						if (!provider) {
							ctx.context.logger.warn("OAuth provider not found", {
								providerId,
							});
							throw redirectOnError(ctx, errorURL, "oauth_provider_not_found");
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
								"Failed to validate authorization code",
								e,
							);
							throw redirectOnError(ctx, errorURL, "invalid_code");
						}

						if (!tokens) {
							throw redirectOnError(ctx, errorURL, "invalid_code");
						}

						// Get user info from provider
						const userInfoResult = await provider.getUserInfo(tokens);
						const userInfo = userInfoResult?.user;

						if (!userInfo) {
							ctx.context.logger.error("Unable to get user info from provider");
							throw redirectOnError(ctx, errorURL, "unable_to_get_user_info");
						}

						if (!userInfo.email) {
							ctx.context.logger.error("Provider did not return email");
							throw redirectOnError(ctx, errorURL, "email_not_found");
						}

						const proxyCallbackURL = new URL(stateData.callbackURL);
						const finalCallbackURL =
							proxyCallbackURL.searchParams.get("callbackURL") ||
							stateData.callbackURL;

						const payload: PassthroughPayload = {
							userInfo: {
								id: String(userInfo.id),
								email: userInfo.email,
								name: userInfo.name || "",
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
							key: getEncryptionKey(ctx),
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

						// Recover the plaintext OAuth state for the configured strategy,
						// then re-encrypt it under `getEncryptionKey` (the shared/proxy
						// secret) so production can read it back; production does not have
						// this environment's `BETTER_AUTH_SECRET`. Any failure (malformed
						// cookie, decrypt, or encrypt) falls back to a non-proxied flow.
						try {
							let plaintextState: string | undefined;
							if (ctx.context.oauthConfig.storeStateStrategy === "cookie") {
								// Cookie mode: the `oauth_state` cookie is encrypted with this
								// environment's secret, so decrypt it locally to recover the state.
								const setCookieHeader =
									ctx.context.responseHeaders?.get("set-cookie");
								if (setCookieHeader) {
									const oauthStateCookie =
										ctx.context.createAuthCookie("oauth_state");
									const encryptedCookieValue = parseSetCookieHeader(
										setCookieHeader,
									).get(oauthStateCookie.name)?.value;
									if (encryptedCookieValue) {
										plaintextState = await symmetricDecrypt({
											key: ctx.context.secretConfig,
											data: encryptedCookieValue,
										});
									}
								}
							} else {
								// Database mode: the verification value is already plaintext JSON.
								const verification =
									await ctx.context.internalAdapter.findVerificationValue(
										originalState,
									);
								plaintextState = verification?.value;
							}
							if (!plaintextState) {
								ctx.context.logger.warn("No OAuth state found for proxy");
								return;
							}

							// Re-encrypt the state under the proxy key, then wrap it in the
							// package production reads back with that same key.
							const stateCookie = await symmetricEncrypt({
								key: getEncryptionKey(ctx),
								data: plaintextState,
							});
							const statePackage: OAuthProxyStatePackage = {
								state: originalState,
								stateCookie,
								isOAuthProxy: true,
							};
							const encryptedPackage = await symmetricEncrypt({
								key: getEncryptionKey(ctx),
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
								"Failed to prepare OAuth proxy state:",
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
							(typeof ctx.context.options.baseURL === "string"
								? ctx.context.options.baseURL
								: undefined) ||
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
	} satisfies BetterAuthPlugin;
};
