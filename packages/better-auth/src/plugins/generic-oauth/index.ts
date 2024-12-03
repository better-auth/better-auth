import { betterFetch } from "@better-fetch/fetch";
import { APIError } from "better-call";
import { parseJWT } from "oslo/jwt";
import { z } from "zod";
import { createAuthEndpoint } from "../../api";
import { setSessionCookie } from "../../cookies";
import {
	createAuthorizationURL,
	validateAuthorizationCode,
	type OAuth2Tokens,
} from "../../oauth2";
import { handleOAuthUserInfo } from "../../oauth2/link-account";
import { generateState, parseState } from "../../oauth2/state";
import type { BetterAuthPlugin, User } from "../../types";

/**
 * Configuration interface for generic OAuth providers.
 */
interface GenericOAuthConfig {
	/** Unique identifier for the OAuth provider */
	providerId: string;
	/**
	 * URL to fetch OAuth 2.0 configuration.
	 * If provided, the authorization and token endpoints will be fetched from this URL.
	 */
	discoveryUrl?: string;
	/**
	 * Type of OAuth flow.
	 * @default "oauth2"
	 */
	type?: "oauth2" | "oidc";
	/**
	 * URL for the authorization endpoint.
	 * Optional if using discoveryUrl.
	 */
	authorizationUrl?: string;
	/**
	 * URL for the token endpoint.
	 * Optional if using discoveryUrl.
	 */
	tokenUrl?: string;
	/**
	 * URL for the user info endpoint.
	 * Optional if using discoveryUrl.
	 */
	userInfoUrl?: string;
	/** OAuth client ID */
	clientId: string;
	/** OAuth client secret */
	clientSecret: string;
	/**
	 * Array of OAuth scopes to request.
	 * @default []
	 */
	scopes?: string[];
	/**
	 * Custom redirect URI.
	 * If not provided, a default URI will be constructed.
	 */
	redirectURI?: string;
	/**
	 * OAuth response type.
	 * @default "code"
	 */
	responseType?: string;
	/**
	 * Prompt parameter for the authorization request.
	 * Controls the authentication experience for the user.
	 */
	prompt?: string;
	/**
	 * Whether to use PKCE (Proof Key for Code Exchange)
	 * @default false
	 */
	pkce?: boolean;
	/**
	 * Access type for the authorization request.
	 * Use "offline" to request a refresh token.
	 */
	accessType?: string;
	/**
	 * Custom function to fetch user info.
	 * If provided, this function will be used instead of the default user info fetching logic.
	 * @param tokens - The OAuth tokens received after successful authentication
	 * @returns A promise that resolves to a User object or null
	 */
	getUserInfo?: (tokens: OAuth2Tokens) => Promise<User | null>;
	/**
	 * Custom function to map the user profile to a User object.
	 */
	mapProfileToUser?: (profile: Record<string, any>) =>
		| {
				id?: string;
				name?: string;
				email?: string;
				image?: string;
				emailVerified?: boolean;
				[key: string]: any;
		  }
		| Promise<{
				id?: string;
				name?: string;
				email?: string;
				image?: string;
				emailVerified?: boolean;
				[key: string]: any;
		  }>;
}

interface GenericOAuthOptions {
	/**
	 * Array of OAuth provider configurations.
	 */
	config: GenericOAuthConfig[];
}

async function getUserInfo(
	tokens: OAuth2Tokens,
	type: "oauth2" | "oidc",
	finalUserInfoUrl: string | undefined,
) {
	if (type === "oidc" && tokens.idToken) {
		const decoded = parseJWT(tokens.idToken) as {
			payload: {
				sub: string;
				email_verified: boolean;
				email: string;
			};
		};
		if (decoded?.payload) {
			return {
				id: decoded.payload.sub,
				emailVerified: decoded.payload.email_verified,
				...decoded.payload,
			};
		}
	}

	if (!finalUserInfoUrl) {
		return null;
	}

	const userInfo = await betterFetch<{
		email: string;
		sub?: string;
		name: string;
		email_verified: boolean;
	}>(finalUserInfoUrl, {
		method: "GET",
		headers: {
			Authorization: `Bearer ${tokens.accessToken}`,
		},
	});
	return {
		id: userInfo.data?.sub,
		emailVerified: userInfo.data?.email_verified,
		email: userInfo.data?.email,
		...userInfo.data,
	};
}

/**
 * A generic OAuth plugin that can be used to add OAuth support to any provider
 */
export const genericOAuth = (options: GenericOAuthOptions) => {
	return {
		id: "generic-oauth",
		endpoints: {
			signInWithOAuth2: createAuthEndpoint(
				"/sign-in/oauth2",
				{
					method: "POST",
					query: z
						.object({
							/**
							 * Redirect to the current URL after the
							 * user has signed in.
							 */
							currentURL: z
								.string({
									description: "Redirect to the current URL after sign in",
								})
								.optional(),
						})
						.optional(),
					body: z.object({
						providerId: z.string({
							description: "The provider ID for the OAuth provider",
						}),
						callbackURL: z
							.string({
								description: "The URL to redirect to after sign in",
							})
							.optional(),
						errorCallbackURL: z
							.string({
								description: "The URL to redirect to if an error occurs",
							})
							.optional(),
					}),
					metadata: {
						openapi: {
							description: "Sign in with OAuth2",
							responses: {
								200: {
									description: "Sign in with OAuth2",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													url: {
														type: "string",
													},
													redirect: {
														type: "boolean",
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
				async (ctx) => {
					const { providerId } = ctx.body;
					const config = options.config.find(
						(c) => c.providerId === providerId,
					);
					if (!config) {
						throw new APIError("BAD_REQUEST", {
							message: `No config found for provider ${providerId}`,
						});
					}
					const {
						discoveryUrl,
						authorizationUrl,
						tokenUrl,
						clientId,
						clientSecret,
						scopes,
						redirectURI,
						responseType,
						pkce,
						prompt,
						accessType,
					} = config;
					let finalAuthUrl = authorizationUrl;
					let finalTokenUrl = tokenUrl;
					if (discoveryUrl) {
						const discovery = await betterFetch<{
							authorization_endpoint: string;
							token_endpoint: string;
						}>(discoveryUrl, {
							onError(context) {
								ctx.context.logger.error(context.error.message, context.error, {
									discoveryUrl,
								});
							},
						});
						if (discovery.data) {
							finalAuthUrl = discovery.data.authorization_endpoint;
							finalTokenUrl = discovery.data.token_endpoint;
						}
					}
					if (!finalAuthUrl || !finalTokenUrl) {
						throw new APIError("BAD_REQUEST", {
							message: "Invalid OAuth configuration.",
						});
					}
					const { state, codeVerifier } = await generateState(ctx);
					const authUrl = await createAuthorizationURL({
						id: providerId,
						options: {
							clientId,
							clientSecret,
							redirectURI,
						},
						authorizationEndpoint: finalAuthUrl,
						state,
						codeVerifier: pkce ? codeVerifier : undefined,
						scopes: scopes || [],
						redirectURI: `${ctx.context.baseURL}/oauth2/callback/${providerId}`,
					});

					if (responseType && responseType !== "code") {
						authUrl.searchParams.set("response_type", responseType);
					}

					if (prompt) {
						authUrl.searchParams.set("prompt", prompt);
					}

					if (accessType) {
						authUrl.searchParams.set("access_type", accessType);
					}

					return ctx.json({
						url: authUrl.toString(),
						redirect: true,
					});
				},
			),
			oAuth2Callback: createAuthEndpoint(
				"/oauth2/callback/:providerId",
				{
					method: "GET",
					query: z.object({
						code: z
							.string({
								description: "The OAuth2 code",
							})
							.optional(),
						error: z
							.string({
								description: "The error message, if any",
							})
							.optional(),
						state: z.string({
							description: "The state parameter from the OAuth2 request",
						}),
					}),
					metadata: {
						openapi: {
							description: "OAuth2 callback",
							responses: {
								200: {
									description: "OAuth2 callback",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													url: {
														type: "string",
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
				async (ctx) => {
					if (ctx.query.error || !ctx.query.code) {
						throw ctx.redirect(
							`${ctx.context.baseURL}?error=${
								ctx.query.error || "oAuth_code_missing"
							}`,
						);
					}
					const provider = options.config.find(
						(p) => p.providerId === ctx.params.providerId,
					);

					if (!provider) {
						throw new APIError("BAD_REQUEST", {
							message: `No config found for provider ${ctx.params.providerId}`,
						});
					}
					let tokens: OAuth2Tokens | undefined = undefined;
					const parsedState = await parseState(ctx);

					const { callbackURL, codeVerifier, errorURL } = parsedState;
					const code = ctx.query.code;

					let finalTokenUrl = provider.tokenUrl;
					let finalUserInfoUrl = provider.userInfoUrl;
					if (provider.discoveryUrl) {
						const discovery = await betterFetch<{
							token_endpoint: string;
							userinfo_endpoint: string;
						}>(provider.discoveryUrl, {
							method: "GET",
						});
						if (discovery.data) {
							finalTokenUrl = discovery.data.token_endpoint;
							finalUserInfoUrl = discovery.data.userinfo_endpoint;
						}
					}
					try {
						if (!finalTokenUrl) {
							throw new APIError("BAD_REQUEST", {
								message: "Invalid OAuth configuration.",
							});
						}
						tokens = await validateAuthorizationCode({
							code,
							codeVerifier,
							redirectURI: `${ctx.context.baseURL}/oauth2/callback/${provider.providerId}`,
							options: {
								clientId: provider.clientId,
								clientSecret: provider.clientSecret,
							},
							tokenEndpoint: finalTokenUrl,
						});
					} catch (e) {
						ctx.context.logger.error(
							e && typeof e === "object" && "name" in e
								? (e.name as string)
								: "",
							e,
						);
						throw ctx.redirect(
							`${errorURL}?error=oauth_code_verification_failed`,
						);
					}

					if (!tokens) {
						throw new APIError("BAD_REQUEST", {
							message: "Invalid OAuth configuration.",
						});
					}
					const userInfo = (
						provider.getUserInfo
							? await provider.getUserInfo(tokens)
							: await getUserInfo(
									tokens,
									provider.type || "oauth2",
									finalUserInfoUrl,
								)
					) as User | null;

					if (!userInfo?.email) {
						ctx.context.logger.error("Unable to get user info", userInfo);
						throw ctx.redirect(
							`${ctx.context.baseURL}/error?error=email_is_missing`,
						);
					}

					const mapUser = provider.mapProfileToUser
						? await provider.mapProfileToUser(userInfo)
						: null;

					const result = await handleOAuthUserInfo(ctx, {
						userInfo: {
							...userInfo,
							...mapUser,
						},
						account: {
							providerId: provider.providerId,
							accountId: userInfo.id,
							...tokens,
							scope: tokens.scopes?.join(","),
						},
					});
					function redirectOnError(error: string) {
						throw ctx.redirect(
							`${
								errorURL || callbackURL || `${ctx.context.baseURL}/error`
							}?error=${error}`,
						);
					}
					if (result.error) {
						return redirectOnError(result.error.split(" ").join("_"));
					}
					const { session, user } = result.data!;
					await setSessionCookie(ctx, {
						session,
						user,
					});
					let toRedirectTo: string;
					try {
						const url = new URL(callbackURL);
						toRedirectTo = url.toString();
					} catch {
						toRedirectTo = callbackURL;
					}
					throw ctx.redirect(toRedirectTo);
				},
			),
		},
	} satisfies BetterAuthPlugin;
};
