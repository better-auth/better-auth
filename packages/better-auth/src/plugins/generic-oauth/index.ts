import { z } from "zod";
import { APIError } from "better-call";
import type { BetterAuthPlugin, OAuth2Tokens, User } from "../../types";
import { createAuthEndpoint } from "../../api";
import { betterFetch } from "@better-fetch/fetch";
import { generateState, parseState } from "../../utils/state";
import { generateCodeVerifier } from "oslo/oauth2";
import { logger } from "../../utils/logger";
import {
	createAuthorizationURL,
	validateAuthorizationCode,
} from "../../social-providers/utils";

import { parseJWT } from "oslo/jwt";
import { userSchema } from "../../db/schema";
import { generateId } from "../../utils/id";
import { getAccountTokens } from "../../utils/getAccount";
import { setSessionCookie } from "../../cookies";

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
		const decoded = parseJWT(tokens.idToken);
		if (decoded?.payload) {
			return decoded.payload;
		}
	}

	if (!finalUserInfoUrl) {
		return null;
	}

	const userInfo = await betterFetch<User>(finalUserInfoUrl, {
		method: "GET",
		headers: {
			Authorization: `Bearer ${tokens.accessToken}`,
		},
	});
	return userInfo.data;
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
							currentURL: z.string().optional(),
						})
						.optional(),
					body: z.object({
						providerId: z.string(),
						callbackURL: z.string().optional(),
					}),
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
								logger.error(context.error, {
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

					const currentURL = ctx.query?.currentURL
						? new URL(ctx.query?.currentURL)
						: null;
					const callbackURL = ctx.body.callbackURL?.startsWith("http")
						? ctx.body.callbackURL
						: `${currentURL?.origin}${ctx.body.callbackURL || ""}`;
					const state = generateState(
						callbackURL || currentURL?.origin || ctx.context.baseURL,
						ctx.query?.currentURL,
					);
					const cookie = ctx.context.authCookies;
					await ctx.setSignedCookie(
						cookie.state.name,
						state.code,
						ctx.context.secret,
						cookie.state.options,
					);
					const codeVerifier = generateCodeVerifier();
					await ctx.setSignedCookie(
						cookie.pkCodeVerifier.name,
						codeVerifier,
						ctx.context.secret,
						cookie.pkCodeVerifier.options,
					);
					const authUrl = await createAuthorizationURL({
						id: providerId,
						options: {
							clientId,
							clientSecret,
							redirectURI:
								redirectURI ||
								`${ctx.context.baseURL}/oauth2/callback/${providerId}`,
						},
						authorizationEndpoint: finalAuthUrl,
						state: state.state,
						codeVerifier: codeVerifier,
						scopes: scopes || [],
						disablePkce: !pkce,
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

					return {
						url: authUrl.toString(),
						state: state.state,
						codeVerifier,
						redirect: true,
					};
				},
			),
			oAuth2Callback: createAuthEndpoint(
				"/oauth2/callback/:providerId",
				{
					method: "GET",
					query: z.object({
						code: z.string().optional(),
						error: z.string().optional(),
						state: z.string(),
					}),
				},
				async (ctx) => {
					if (ctx.query.error || !ctx.query.code) {
						const parsedState = parseState(ctx.query.state);
						const callbackURL =
							parsedState.data?.currentURL || `${ctx.context.baseURL}/error`;
						ctx.context.logger.error(ctx.query.error, ctx.params.providerId);
						throw ctx.redirect(
							`${callbackURL}?error=${ctx.query.error || "oAuth_code_missing"}`,
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

					const codeVerifier = await ctx.getSignedCookie(
						ctx.context.authCookies.pkCodeVerifier.name,
						ctx.context.secret,
					);

					let tokens: OAuth2Tokens | undefined = undefined;
					const parsedState = parseState(ctx.query.state);
					if (!parsedState.success) {
						throw ctx.redirect(
							`${ctx.context.baseURL}/error?error=invalid_state`,
						);
					}
					const {
						data: { callbackURL, currentURL, code },
					} = parsedState;
					const errorURL =
						parsedState.data?.currentURL || `${ctx.context.baseURL}/error`;
					const storedCode = await ctx.getSignedCookie(
						ctx.context.authCookies.state.name,
						ctx.context.secret,
					);

					if (storedCode !== code) {
						logger.error("OAuth code mismatch", storedCode, code);
						throw ctx.redirect(`${errorURL}?error=please_restart_the_process`);
					}
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
						ctx.context.logger.error(e);
						throw ctx.redirect(
							`${errorURL}?error=oauth_code_verification_failed`,
						);
					}

					if (!tokens) {
						throw new APIError("BAD_REQUEST", {
							message: "Invalid OAuth configuration.",
						});
					}
					const userInfo = provider.getUserInfo
						? await provider.getUserInfo(tokens)
						: await getUserInfo(
								tokens,
								provider.type || "oauth2",
								finalUserInfoUrl,
							);
					const id = generateId();
					const user = userInfo
						? userSchema.safeParse({
								...userInfo,
								id,
							})
						: null;
					if (!user?.success) {
						throw ctx.redirect(`${errorURL}?error=oauth_user_info_invalid`);
					}
					const dbUser = await ctx.context.internalAdapter
						.findUserByEmail(user.data.email)
						.catch((e) => {
							logger.error(
								"Better auth was unable to query your database.\nError: ",
								e,
							);
							throw ctx.redirect(`${errorURL}?error=internal_server_error`);
						});

					const userId = dbUser?.user.id || id;

					if (dbUser) {
						//check if user has already linked this provider
						const hasBeenLinked = dbUser.accounts.find(
							(a) => a.providerId === provider.providerId,
						);
						const trustedProviders =
							ctx.context.options.account?.accountLinking?.trustedProviders;
						const isTrustedProvider = trustedProviders
							? trustedProviders.includes(provider.providerId as "apple")
							: true;

						if (
							!hasBeenLinked &&
							(!user?.data.emailVerified || !isTrustedProvider)
						) {
							let url: URL;
							try {
								url = new URL(errorURL);
								url.searchParams.set("error", "account_not_linked");
							} catch (e) {
								throw ctx.redirect(`${errorURL}?error=account_not_linked`);
							}
							throw ctx.redirect(url.toString());
						}
						if (!hasBeenLinked) {
							try {
								await ctx.context.internalAdapter.linkAccount({
									providerId: provider.providerId,
									accountId: user.data.id,
									id: `${provider.providerId}:${user.data.id}`,
									userId: dbUser.user.id,
									...getAccountTokens(tokens),
								});
							} catch (e) {
								console.log(e);
								throw ctx.redirect(`${errorURL}?error=failed_linking_account`);
							}
						}
					} else {
						try {
							await ctx.context.internalAdapter.createOAuthUser(user.data, {
								...getAccountTokens(tokens),
								id: `${provider.providerId}:${user.data.id}`,
								providerId: provider.providerId,
								accountId: user.data.id,
								userId: userId!,
							});
						} catch (e) {
							const url = new URL(errorURL);
							url.searchParams.set("error", "unable_to_create_user");
							ctx.setHeader("Location", url.toString());
							throw ctx.redirect(url.toString());
						}
					}

					try {
						const session = await ctx.context.internalAdapter.createSession(
							userId || id,
							ctx.request,
						);
						if (!session) {
							throw ctx.redirect(`${errorURL}?error=unable_to_create_session`);
						}
						await setSessionCookie(ctx, session.id);
					} catch {
						throw ctx.redirect(`${errorURL}?error=unable_to_create_session`);
					}
					throw ctx.redirect(callbackURL || currentURL || "");
				},
			),
		},
	} satisfies BetterAuthPlugin;
};
