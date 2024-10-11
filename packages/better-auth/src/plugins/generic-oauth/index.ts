import { z } from "zod";
import { APIError } from "better-call";
import type { BetterAuthPlugin, User } from "../../types";
import { createAuthEndpoint } from "../../api";
import { betterFetch } from "@better-fetch/fetch";
import { generateState, parseState } from "../../utils/state";
import { generateCodeVerifier } from "oslo/oauth2";
import { logger } from "../../utils/logger";
import {
	createAuthorizationURL,
	validateAuthorizationCode,
} from "../../social-providers/utils";
import type { OAuth2Tokens } from "arctic";
import { parseJWT } from "oslo/jwt";
import { userSchema } from "../../db/schema";
import { generateId } from "../../utils/id";
import { getAccountTokens } from "../../utils/getAccount";
import { setSessionCookie } from "../../cookies";

interface GenericOAuthConfig {
	providerId: string;
	discoveryUrl?: string;
	authorizationUrl?: string;
	tokenUrl?: string;
	userInfoUrl?: string;
	clientId: string;
	clientSecret: string;
	scopes?: string[];
	redirectURI?: string;
	responseType?: string;
	prompt?: string;
	pkce?: boolean;
	accessType?: string;
	getUserInfo?: (tokens: OAuth2Tokens) => Promise<User | null>;
}

interface GenericOAuthOptions {
	config: GenericOAuthConfig[];
}

async function getUserInfo(
	tokens: OAuth2Tokens,
	finalUserInfoUrl: string | undefined,
) {
	const idToken = tokens.idToken();
	if (idToken) {
		const decoded = parseJWT(idToken);
		console.log({ payload: decoded });
		if (decoded?.payload) {
			return decoded.payload;
		}
	} else {
		if (!finalUserInfoUrl) {
			return null;
		}

		const userInfo = await betterFetch<User>(finalUserInfoUrl, {
			method: "GET",
			headers: {
				Authorization: `Bearer ${tokens.accessToken()}`,
			},
		});
		return userInfo.data;
	}
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
					const authUrl = createAuthorizationURL(
						providerId,
						{
							clientId,
							clientSecret,
							redirectURI:
								redirectURI ||
								`${ctx.context.baseURL}/oauth2/callback/${providerId}`,
						},
						finalAuthUrl,
						state.state,
						codeVerifier,
						scopes || [],
						!pkce,
					);

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
							parsedState.data?.callbackURL || `${ctx.context.baseURL}/error`;
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
						data: { callbackURL, currentURL, dontRememberMe, code },
					} = parsedState;
					const storedCode = await ctx.getSignedCookie(
						ctx.context.authCookies.state.name,
						ctx.context.secret,
					);

					if (storedCode !== code) {
						console.log("OAuth code mismatch", storedCode, code);
						logger.error("OAuth code mismatch", storedCode, code);
						if (callbackURL || currentURL) {
							throw ctx.redirect(
								`${callbackURL || currentURL}?error=please_restart_the_process`,
							);
						}
						throw ctx.redirect(
							`${ctx.context.baseURL}/error?error=please_restart_the_process`,
						);
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
							`${
								parsedState.data?.callbackURL || `${ctx.context.baseURL}/error`
							}?error=oauth_code_verification_failed`,
						);
					}

					if (!tokens) {
						throw new APIError("BAD_REQUEST", {
							message: "Invalid OAuth configuration.",
						});
					}
					const userInfo = provider.getUserInfo
						? await provider.getUserInfo(tokens)
						: await getUserInfo(tokens, finalUserInfoUrl);
					const id = generateId();
					const user = userInfo
						? userSchema.safeParse({
								...userInfo,
								id,
							})
						: null;
					if (!user?.success) {
						throw ctx.redirect(
							`${
								parsedState.data?.callbackURL || `${ctx.context.baseURL}/error`
							}?error=oauth_user_info_invalid`,
						);
					}
					const dbUser = await ctx.context.internalAdapter
						.findUserByEmail(user.data.email)
						.catch((e) => {
							logger.error(
								"Better auth was unable to query your database.\nError: ",
								e,
							);
							throw ctx.redirect(
								`${ctx.context.baseURL}/error?error=internal_server_error`,
							);
						});

					const userId = dbUser?.user.id;

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
								url = new URL(
									parsedState.data?.callbackURL ||
										`${ctx.context.baseURL}/error`,
								);
								url.searchParams.set("error", "account_not_linked");
							} catch (e) {
								throw ctx.redirect(
									`${ctx.context.baseURL}/error?error=account_not_linked`,
								);
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
								throw ctx.redirect(
									`${ctx.context.baseURL}/error?error=failed_linking_account`,
								);
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
							const url = new URL(
								parsedState.data?.callbackURL || `${ctx.context.baseURL}/error`,
							);
							url.searchParams.set("error", "unable_to_create_user");
							ctx.setHeader("Location", url.toString());
							throw ctx.redirect(url.toString());
						}
					}

					try {
						const session = await ctx.context.internalAdapter.createSession(
							userId || id,
							ctx.request,
							parsedState.data?.dontRememberMe,
						);
						if (!session) {
							if (callbackURL || currentURL) {
								throw ctx.redirect(
									`${callbackURL || currentURL}?error=unable_to_create_session`,
								);
							}
							throw ctx.redirect(
								`${ctx.context.baseURL}/error?error=unable_to_create_session`,
							);
						}
						try {
							await setSessionCookie(ctx, session.id, dontRememberMe);
						} catch (e) {
							ctx.context.logger.error("Unable to set session cookie", e);
							if (currentURL || callbackURL) {
								const url = new URL(currentURL || callbackURL || "");
								url.searchParams.set("error", "unable_to_create_session");
								throw ctx.redirect(url.toString());
							}
							throw ctx.redirect(
								`${ctx.context.baseURL}/error?error=unable_to_create_session`,
							);
						}
					} catch {
						if (currentURL || callbackURL) {
							const url = new URL(currentURL || callbackURL || "");
							url.searchParams.set("error", "unable_to_create_session");
							throw ctx.redirect(url.toString());
						}
						throw ctx.redirect(
							`${ctx.context.baseURL}/error?error=unable_to_create_session`,
						);
					}
					throw ctx.redirect(callbackURL || currentURL || "");
				},
			),
		},
	} satisfies BetterAuthPlugin;
};
