import type { AuthContext, BetterAuthPlugin } from "@better-auth/core";
import type { OAuth2Tokens, OAuthProvider } from "@better-auth/core/oauth2";
import {
	createAuthorizationURL,
	refreshAccessToken,
	validateAuthorizationCode,
} from "@better-auth/core/oauth2";
import { betterFetch } from "@better-fetch/fetch";
import { APIError } from "better-call";
import { GENERIC_OAUTH_ERROR_CODES } from "./error-codes";
import {
	getUserInfo,
	oAuth2Callback,
	oAuth2LinkAccount,
	signInWithOAuth2,
} from "./routes";
import type { GenericOAuthConfig, GenericOAuthOptions } from "./types";

export * from "./providers";
export type { GenericOAuthConfig, GenericOAuthOptions } from "./types";

/**
 * Base type for OAuth provider options.
 * Extracts common fields from GenericOAuthConfig and makes clientSecret required.
 */
export type BaseOAuthProviderOptions = Omit<
	Pick<
		GenericOAuthConfig,
		| "clientId"
		| "clientSecret"
		| "scopes"
		| "redirectURI"
		| "pkce"
		| "disableImplicitSignUp"
		| "disableSignUp"
		| "overrideUserInfo"
	>,
	"clientSecret"
> & {
	/** OAuth client secret (required for provider options) */
	clientSecret: string;
};

/**
 * A generic OAuth plugin that can be used to add OAuth support to any provider
 */
export const genericOAuth = (options: GenericOAuthOptions) => {
	return {
		id: "generic-oauth",
		init: (ctx: AuthContext) => {
			const genericProviders = options.config.map((c) => {
				let finalUserInfoUrl = c.userInfoUrl;
				return {
					id: c.providerId,
					name: c.providerId,
					async createAuthorizationURL(data: {
						state: string;
						codeVerifier: string;
						scopes?: string[] | undefined;
						redirectURI: string;
						display?: string | undefined;
						loginHint?: string | undefined;
					}) {
						let finalAuthUrl = c.authorizationUrl;
						if (!finalAuthUrl && c.discoveryUrl) {
							const discovery = await betterFetch<{
								authorization_endpoint: string;
								userinfo_endpoint: string;
							}>(c.discoveryUrl, {
								method: "GET",
								headers: c.discoveryHeaders,
							});
							if (discovery.data) {
								finalAuthUrl = discovery.data.authorization_endpoint;
								finalUserInfoUrl =
									finalUserInfoUrl ?? discovery.data.userinfo_endpoint;
							}
						}
						if (!finalAuthUrl) {
							throw new APIError("BAD_REQUEST", {
								message: GENERIC_OAUTH_ERROR_CODES.INVALID_OAUTH_CONFIGURATION,
							});
						}
						return createAuthorizationURL({
							id: c.providerId,
							options: {
								clientId: c.clientId,
								clientSecret: c.clientSecret,
								redirectURI: c.redirectURI,
							},
							authorizationEndpoint: finalAuthUrl,
							state: data.state,
							codeVerifier: c.pkce ? data.codeVerifier : undefined,
							scopes: c.scopes || [],
							redirectURI: `${ctx.baseURL}/oauth2/callback/${c.providerId}`,
						});
					},
					async validateAuthorizationCode(data: {
						code: string;
						redirectURI: string;
						codeVerifier?: string | undefined;
						deviceId?: string | undefined;
					}) {
						// Use custom getToken if provided
						if (c.getToken) {
							return c.getToken(data);
						}

						// Standard token exchange flow
						let finalTokenUrl = c.tokenUrl;
						if (c.discoveryUrl) {
							const discovery = await betterFetch<{
								token_endpoint: string;
								userinfo_endpoint: string;
							}>(c.discoveryUrl, {
								method: "GET",
								headers: c.discoveryHeaders,
							});
							if (discovery.data) {
								finalTokenUrl = discovery.data.token_endpoint;
								finalUserInfoUrl = discovery.data.userinfo_endpoint;
							}
						}
						if (!finalTokenUrl) {
							throw new APIError("BAD_REQUEST", {
								message: GENERIC_OAUTH_ERROR_CODES.TOKEN_URL_NOT_FOUND,
							});
						}
						return validateAuthorizationCode({
							headers: c.authorizationHeaders,
							code: data.code,
							codeVerifier: data.codeVerifier,
							redirectURI: data.redirectURI,
							options: {
								clientId: c.clientId,
								clientSecret: c.clientSecret,
								redirectURI: c.redirectURI,
							},
							tokenEndpoint: finalTokenUrl,
							authentication: c.authentication,
						});
					},
					async refreshAccessToken(
						refreshToken: string,
					): Promise<OAuth2Tokens> {
						let finalTokenUrl = c.tokenUrl;
						if (c.discoveryUrl) {
							const discovery = await betterFetch<{
								token_endpoint: string;
							}>(c.discoveryUrl, {
								method: "GET",
								headers: c.discoveryHeaders,
							});
							if (discovery.data) {
								finalTokenUrl = discovery.data.token_endpoint;
							}
						}
						if (!finalTokenUrl) {
							throw new APIError("BAD_REQUEST", {
								message: GENERIC_OAUTH_ERROR_CODES.TOKEN_URL_NOT_FOUND,
							});
						}
						return refreshAccessToken({
							refreshToken,
							options: {
								clientId: c.clientId,
								clientSecret: c.clientSecret,
							},
							authentication: c.authentication,
							tokenEndpoint: finalTokenUrl,
						});
					},
					async getUserInfo(tokens: OAuth2Tokens) {
						const userInfo = c.getUserInfo
							? await c.getUserInfo(tokens)
							: await getUserInfo(tokens, finalUserInfoUrl);
						if (!userInfo) {
							return null;
						}

						const userMap = await c.mapProfileToUser?.(userInfo);

						return {
							user: {
								id: userInfo?.id,
								email: userInfo?.email,
								emailVerified: userInfo?.emailVerified,
								image: userInfo?.image,
								name: userInfo?.name,
								...userMap,
							},
							data: userInfo,
						};
					},
					options: {
						overrideUserInfoOnSignIn: c.overrideUserInfo,
					},
				} as OAuthProvider;
			});
			return {
				context: {
					socialProviders: genericProviders.concat(ctx.socialProviders),
				},
			};
		},
		endpoints: {
			signInWithOAuth2: signInWithOAuth2(options),
			oAuth2Callback: oAuth2Callback(options),
			oAuth2LinkAccount: oAuth2LinkAccount(options),
		},
		$ERROR_CODES: GENERIC_OAUTH_ERROR_CODES,
	} satisfies BetterAuthPlugin;
};
