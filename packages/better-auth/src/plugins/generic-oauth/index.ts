import type {
	AuthContext,
	BetterAuthPlugin,
	GenericEndpointContext,
} from "@better-auth/core";
import { getCurrentAuthContext } from "@better-auth/core/context";
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

function buildClientAssertion(
	config: GenericOAuthConfig,
	tokenEndpoint: string,
) {
	if (config.authentication !== "private_key_jwt" || !config.clientAssertion) {
		return undefined;
	}
	return { ...config.clientAssertion, tokenEndpoint };
}

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
	id_token_signing_alg_values_supported?: string[];
}

async function fetchDiscovery(
	url: string,
	headers?: Record<string, string>,
): Promise<DiscoveryDocument | null> {
	const result = await betterFetch<DiscoveryDocument>(url, {
		method: "GET",
		headers,
	});
	if (result.error || !result.data) {
		return null;
	}
	// Validate the issuer is a syntactically valid URL
	if (result.data.issuer) {
		try {
			new URL(result.data.issuer);
		} catch {
			return null;
		}
	}
	return result.data;
}

async function fetchUserInfo(
	tokens: OAuth2Tokens,
	userInfoUrl: string | undefined,
): Promise<OAuth2UserInfo | null> {
	// TODO: verify id_token signature using the provider's JWKS endpoint
	// (discoverable from jwks_uri in the OIDC discovery document). Currently
	// we only decode without cryptographic verification, which is acceptable
	// when the token arrives over a TLS-protected server-to-server channel
	// but does not satisfy OIDC Core 1.0 Section 3.1.3.7.
	if (tokens.idToken) {
		try {
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
		} catch {
			// Malformed ID token — fall through to userinfo endpoint
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
	if (userInfo.error || !userInfo.data) {
		return null;
	}
	const data = userInfo.data;
	return {
		...data,
		id: data.sub ?? ((data as Record<string, any>).id as string) ?? "",
		emailVerified: data.email_verified ?? false,
		email: data.email,
		image: data.picture,
		name: data.name,
	};
}

/**
 * A generic OAuth plugin that registers any OAuth/OIDC provider
 * as a first-class social provider.
 *
 * Providers are used through the standard `signIn.social` and
 * `callback/:id` core endpoints — no plugin-specific endpoints needed.
 */
export const genericOAuth = <const ID extends string>(
	options: GenericOAuthOptions<ID>,
) => {
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

				let issuer: string | undefined;
				let isOidc = false;

				if (c.discoveryUrl) {
					const discovered = await fetchDiscovery(
						c.discoveryUrl,
						c.discoveryHeaders,
					).catch((err) => {
						ctx.logger.error(
							`Discovery fetch failed for "${c.providerId}": ${err}`,
						);
						return null;
					});
					if (discovered) {
						authorizationUrl ??= discovered.authorization_endpoint;
						tokenUrl ??= discovered.token_endpoint;
						userInfoUrl ??= discovered.userinfo_endpoint;
						issuer = discovered.issuer;
						isOidc =
							Array.isArray(discovered.id_token_signing_alg_values_supported) &&
							discovered.id_token_signing_alg_values_supported.length > 0;
					} else if (!authorizationUrl || !tokenUrl) {
						ctx.logger.error(
							`Provider "${c.providerId}": discovery returned no data and no explicit endpoints configured. OAuth sign-in will fail for this provider.`,
						);
					}
				}

				if (
					!c.clientSecret &&
					!c.clientAssertion &&
					c.authentication !== "private_key_jwt"
				) {
					ctx.logger.warn(
						`Provider "${c.providerId}": no clientSecret or clientAssertion configured. Token exchange will fail unless this is a public client.`,
					);
				}

				genericProviders.push({
					id: c.providerId,
					name: c.name ?? c.providerId,
					issuer,
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
							codeVerifier: (c.pkce ?? true) ? data.codeVerifier : undefined,
							scopes: (() => {
								const merged = [...(data.scopes ?? []), ...(c.scopes ?? [])];
								if (isOidc && !merged.includes("openid")) {
									merged.unshift("openid");
								}
								return merged;
							})(),
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
							codeVerifier: (c.pkce ?? true) ? data.codeVerifier : undefined,
							redirectURI: data.redirectURI,
							options: {
								clientId: c.clientId,
								clientSecret: c.clientSecret,
								redirectURI: c.redirectURI,
							},
							tokenEndpoint: tokenUrl,
							authentication: c.authentication,
							additionalParams: c.tokenUrlParams,
							clientAssertion: buildClientAssertion(c, tokenUrl),
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
						const endpointContext = await getCurrentAuthContext().catch(
							() => null,
						);
						let refreshTokenUrlParams: Record<string, string> | undefined;
						if (typeof c.refreshTokenUrlParams === "function") {
							if (endpointContext) {
								refreshTokenUrlParams = c.refreshTokenUrlParams(
									endpointContext as GenericEndpointContext,
								);
							} else {
								ctx.logger.warn(
									"refreshTokenUrlParams is a function but no endpoint context is available. The params will be skipped. This can happen when refreshAccessToken is called outside a request context (e.g., background jobs).",
								);
							}
						} else {
							refreshTokenUrlParams = c.refreshTokenUrlParams;
						}
						return refreshAccessToken({
							refreshToken,
							options: {
								clientId: c.clientId,
								clientSecret: c.clientSecret,
							},
							authentication: c.authentication,
							extraParams: refreshTokenUrlParams,
							clientAssertion: buildClientAssertion(c, tokenUrl),
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

			const existingIds = new Set(ctx.socialProviders.map((p) => p.id));
			for (const gp of genericProviders) {
				if (existingIds.has(gp.id)) {
					ctx.logger.warn(
						`Generic OAuth provider "${gp.id}" shadows a built-in social provider with the same ID`,
					);
				}
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
