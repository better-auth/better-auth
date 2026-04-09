import type { AuthContext, BetterAuthPlugin } from "@better-auth/core";
import { APIError } from "@better-auth/core/error";
import type {
	OAuth2Tokens,
	OAuth2UserInfo,
	OAuthProvider,
} from "@better-auth/core/oauth2";
import {
	createAuthorizationURL,
	refreshAccessToken,
	validateAuthorizationCode,
} from "@better-auth/core/oauth2";
import { betterFetch } from "@better-fetch/fetch";
import { decodeJwt } from "jose";
import { PACKAGE_VERSION } from "../../version";
import { GENERIC_OAUTH_ERROR_CODES } from "./error-codes";
import type { GenericOAuthConfig, GenericOAuthOptions } from "./types";

export * from "./providers";
export type { GenericOAuthConfig, GenericOAuthOptions } from "./types";

declare module "@better-auth/core" {
	interface BetterAuthPluginRegistry<AuthOptions, Options> {
		"generic-oauth": {
			creator: typeof genericOAuth;
		};
	}
}

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

interface DiscoveryDocument {
	authorization_endpoint?: string;
	token_endpoint?: string;
	userinfo_endpoint?: string;
	issuer?: string;
}

async function fetchDiscovery(
	url: string,
	headers?: Record<string, string>,
): Promise<DiscoveryDocument | null> {
	const result = await betterFetch<DiscoveryDocument>(url, {
		method: "GET",
		headers,
	});
	return result.data ?? null;
}

async function fetchUserInfo(
	tokens: OAuth2Tokens,
	userInfoUrl: string | undefined,
): Promise<OAuth2UserInfo | null> {
	if (tokens.idToken) {
		const decoded = decodeJwt(tokens.idToken) as {
			sub: string;
			email_verified: boolean;
			email: string;
			name: string;
			picture: string;
		};
		if (decoded?.sub && decoded?.email) {
			return {
				id: decoded.sub,
				emailVerified: decoded.email_verified,
				image: decoded.picture,
				...decoded,
			};
		}
	}

	if (!userInfoUrl) {
		return null;
	}

	const userInfo = await betterFetch<{
		email: string;
		sub?: string | undefined;
		name: string;
		email_verified: boolean;
		picture: string;
	}>(userInfoUrl, {
		method: "GET",
		headers: {
			Authorization: `Bearer ${tokens.accessToken}`,
		},
	});
	return {
		id: userInfo.data?.sub ?? "",
		emailVerified: userInfo.data?.email_verified ?? false,
		email: userInfo.data?.email,
		image: userInfo.data?.picture,
		name: userInfo.data?.name,
		...userInfo.data,
	};
}

/**
 * A generic OAuth plugin that registers any OAuth/OIDC provider
 * as a first-class social provider.
 *
 * Providers are used through the standard `signIn.social` and
 * `callback/:id` core endpoints — no plugin-specific endpoints needed.
 */
export const genericOAuth = (options: GenericOAuthOptions) => {
	const seenIds = new Set<string>();
	const nonUniqueIds = new Set<string>();

	for (const config of options.config) {
		const id = config.providerId;
		if (seenIds.has(id)) {
			nonUniqueIds.add(id);
		}
		seenIds.add(id);
	}

	if (nonUniqueIds.size > 0) {
		console.warn(
			`Duplicate provider IDs found: ${Array.from(nonUniqueIds).join(", ")}`,
		);
	}

	return {
		id: "generic-oauth",
		version: PACKAGE_VERSION,
		init: async (ctx: AuthContext) => {
			const genericProviders: OAuthProvider[] = [];

			for (const c of options.config) {
				let authorizationUrl = c.authorizationUrl;
				let tokenUrl = c.tokenUrl;
				let userInfoUrl = c.userInfoUrl;

				if (c.discoveryUrl) {
					const discovered = await fetchDiscovery(
						c.discoveryUrl,
						c.discoveryHeaders,
					).catch((err) => {
						ctx.logger.warn(
							`Failed to fetch discovery for ${c.providerId}: ${err}`,
						);
						return null;
					});
					if (discovered) {
						authorizationUrl ??= discovered.authorization_endpoint;
						tokenUrl ??= discovered.token_endpoint;
						userInfoUrl ??= discovered.userinfo_endpoint;
					}
				}

				genericProviders.push({
					id: c.providerId,
					name: c.providerId,
					createAuthorizationURL(data) {
						if (!authorizationUrl) {
							throw APIError.from(
								"BAD_REQUEST",
								GENERIC_OAUTH_ERROR_CODES.INVALID_OAUTH_CONFIGURATION,
							);
						}
						return createAuthorizationURL({
							id: c.providerId,
							options: {
								clientId: c.clientId,
								clientSecret: c.clientSecret,
								redirectURI: c.redirectURI,
							},
							authorizationEndpoint: authorizationUrl,
							state: data.state,
							codeVerifier: c.pkce ? data.codeVerifier : undefined,
							scopes: data.scopes ?? c.scopes ?? [],
							redirectURI: data.redirectURI,
							prompt: c.prompt,
							accessType: c.accessType,
							responseType: c.responseType,
							responseMode: c.responseMode,
							additionalParams: c.authorizationUrlParams,
							loginHint: data.loginHint,
						});
					},
					async validateAuthorizationCode(data) {
						if (c.getToken) {
							return c.getToken(data);
						}
						if (!tokenUrl) {
							throw APIError.from(
								"BAD_REQUEST",
								GENERIC_OAUTH_ERROR_CODES.TOKEN_URL_NOT_FOUND,
							);
						}
						return validateAuthorizationCode({
							headers: c.authorizationHeaders,
							code: data.code,
							codeVerifier: c.pkce ? data.codeVerifier : undefined,
							redirectURI: data.redirectURI,
							options: {
								clientId: c.clientId,
								clientSecret: c.clientSecret,
								redirectURI: c.redirectURI,
							},
							tokenEndpoint: tokenUrl,
							authentication: c.authentication,
							additionalParams: c.tokenUrlParams,
						});
					},
					async getUserInfo(tokens) {
						const raw = c.getUserInfo
							? await c.getUserInfo(tokens)
							: await fetchUserInfo(tokens, userInfoUrl);
						if (!raw) {
							return null;
						}
						const mapped = c.mapProfileToUser
							? await c.mapProfileToUser(raw)
							: {};
						const user = {
							id: raw.id,
							email: raw.email,
							emailVerified: raw.emailVerified,
							image: raw.image,
							name: raw.name,
							...mapped,
						};
						return {
							user: {
								...user,
								image: user.image ?? undefined,
							},
							data: raw as Record<string, any>,
						};
					},
					async refreshAccessToken(
						refreshToken: string,
					): Promise<OAuth2Tokens> {
						if (!tokenUrl) {
							throw APIError.from(
								"BAD_REQUEST",
								GENERIC_OAUTH_ERROR_CODES.TOKEN_URL_NOT_FOUND,
							);
						}
						return refreshAccessToken({
							refreshToken,
							options: {
								clientId: c.clientId,
								clientSecret: c.clientSecret,
							},
							authentication: c.authentication,
							tokenEndpoint: tokenUrl,
						});
					},
					disableImplicitSignUp: c.disableImplicitSignUp,
					disableSignUp: c.disableSignUp,
					options: {
						disableSignUp: c.disableSignUp,
						overrideUserInfoOnSignIn: c.overrideUserInfo,
					},
				} satisfies OAuthProvider);
			}

			return {
				context: {
					socialProviders: genericProviders.concat(ctx.socialProviders),
				},
			};
		},
		options,
		$ERROR_CODES: GENERIC_OAUTH_ERROR_CODES,
	} satisfies BetterAuthPlugin;
};
