import type { AuthContext, BetterAuthPlugin } from "@better-auth/core";
import { APIError } from "@better-auth/core/error";
import type {
	OAuth2Tokens,
	OAuthIdTokenConfig,
	OAuthProvider,
	OAuthRefreshContext,
} from "@better-auth/core/oauth2";
import {
	applyDefaultAccessTokenExpiry,
	createAuthorizationURL,
	refreshAccessToken,
	validateAuthorizationCode,
	verifyProviderIdToken,
} from "@better-auth/core/oauth2";
import { betterFetch } from "@better-fetch/fetch";
import { createRemoteJWKSet, decodeJwt } from "jose";
import { PACKAGE_VERSION } from "../../version";
import { GENERIC_OAUTH_ERROR_CODES } from "./error-codes";
import type {
	GenericOAuthConfig,
	GenericOAuthOptions,
	GenericOAuthUserInfo,
} from "./types";

function isNonEmptyOAuthId(
	id: string | number | null | undefined,
): id is string | number {
	return id !== undefined && id !== null && id !== "";
}

export * from "./providers";
export type {
	GenericOAuthConfig,
	GenericOAuthOptions,
	GenericOAuthUserInfo,
} from "./types";

declare module "@better-auth/core" {
	interface BetterAuthPluginRegistry<AuthOptions, Options> {
		"generic-oauth": {
			creator: typeof genericOAuth;
		};
	}
}

/**
 * Base type for OAuth provider options.
 * Extracts common fields from GenericOAuthConfig for provider helpers.
 */
export type BaseOAuthProviderOptions = Pick<
	GenericOAuthConfig,
	| "clientId"
	| "clientSecret"
	| "tokenEndpointAuth"
	| "scopes"
	| "redirectURI"
	| "pkce"
	| "disableImplicitSignUp"
	| "disableSignUp"
	| "overrideUserInfo"
>;

interface DiscoveryDocument {
	authorization_endpoint?: string;
	token_endpoint?: string;
	userinfo_endpoint?: string;
	issuer?: string;
	jwks_uri?: string;
	id_token_signing_alg_values_supported?: string[];
}

function isSecretlessTokenEndpointAuth(
	tokenEndpointAuth: GenericOAuthConfig["tokenEndpointAuth"],
) {
	return (
		tokenEndpointAuth?.method === "private_key_jwt" ||
		tokenEndpointAuth?.method === "none"
	);
}

function isClientSecretTokenEndpointAuth(
	tokenEndpointAuth: GenericOAuthConfig["tokenEndpointAuth"],
) {
	return (
		tokenEndpointAuth?.method === "client_secret_basic" ||
		tokenEndpointAuth?.method === "client_secret_post"
	);
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
): Promise<GenericOAuthUserInfo | null> {
	// When the provider declares an `idToken` config (OIDC discovery published
	// a jwks_uri), the caller has already verified this token through
	// `verifyProviderIdToken`. Without one, decoding without signature
	// verification is the OIDC Core 1.0 §3.1.3.7 posture for tokens received
	// over the TLS-protected token-endpoint channel.
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
		id?: string | number | null | undefined;
		email: string;
		sub?: string | number | null | undefined;
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
	const { id: profileId, ...profileFields } = userInfo.data;
	// Non-empty `id` wins over `sub` to keep stored account ids stable. OIDC
	// UserInfo responses must include `sub`; generic OAuth profiles may omit it
	// and let `mapProfileToUser` derive the account id from another field.
	const subjectId = isNonEmptyOAuthId(profileId)
		? profileId
		: isNonEmptyOAuthId(userInfo.data.sub)
			? userInfo.data.sub
			: undefined;
	return {
		...profileFields,
		...(subjectId !== undefined ? { id: subjectId } : {}),
		email: userInfo.data.email,
		emailVerified: userInfo.data.email_verified ?? false,
		image: userInfo.data.picture,
		name: userInfo.data.name,
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
				let idTokenConfig: OAuthIdTokenConfig | undefined;

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
						const signingAlgs =
							discovered.id_token_signing_alg_values_supported;
						isOidc = Array.isArray(signingAlgs) && signingAlgs.length > 0;
						if (discovered.jwks_uri && discovered.issuer) {
							try {
								idTokenConfig = {
									jwks: createRemoteJWKSet(
										new URL(discovered.jwks_uri, c.discoveryUrl),
									),
									issuer: discovered.issuer,
									audience: c.clientId,
									algorithms: isOidc ? signingAlgs : undefined,
								};
							} catch (err) {
								// A malformed jwks_uri must not break provider registration;
								// fall back to the decode posture used by non-discovery providers.
								ctx.logger.error(
									`Provider "${c.providerId}": invalid jwks_uri in discovery document, skipping id_token verification: ${err}`,
								);
							}
						}
					} else if (!authorizationUrl || !tokenUrl) {
						ctx.logger.error(
							`Provider "${c.providerId}": discovery returned no data and no explicit endpoints configured. OAuth sign-in will fail for this provider.`,
						);
					}
				}

				const tokenEndpointAuth = c.tokenEndpointAuth;
				if (
					c.clientSecret &&
					isSecretlessTokenEndpointAuth(tokenEndpointAuth)
				) {
					throw new Error(
						`Provider "${c.providerId}": tokenEndpointAuth.method "${tokenEndpointAuth?.method}" cannot be combined with clientSecret`,
					);
				}

				if (
					!c.clientSecret &&
					isClientSecretTokenEndpointAuth(tokenEndpointAuth)
				) {
					throw new Error(
						`Provider "${c.providerId}": tokenEndpointAuth.method "${tokenEndpointAuth?.method}" requires clientSecret`,
					);
				}

				if (
					!c.clientSecret &&
					!tokenEndpointAuth &&
					c.authentication === "basic"
				) {
					throw new Error(
						`Provider "${c.providerId}": authentication "basic" requires clientSecret`,
					);
				}

				const provider: OAuthProvider = {
					id: c.providerId,
					name: c.name ?? c.providerId,
					issuer,
					idToken: idTokenConfig,
					requiresIdTokenNonce:
						idTokenConfig !== undefined &&
						c.disableIdTokenNonceBinding !== true,
					allowIdpInitiated: c.allowIdpInitiated,
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
							nonce: data.idTokenNonce,
							additionalParams: {
								...(c.authorizationUrlParams ?? {}),
								...(data.additionalParams ?? {}),
							},
							loginHint: data.loginHint,
						});
					},
					async validateAuthorizationCode(data) {
						if (c.getToken) {
							return applyDefaultAccessTokenExpiry(
								await c.getToken(data),
								c.accessTokenExpiresIn,
							);
						}
						if (!tokenUrl) {
							throw APIError.from(
								"BAD_REQUEST",
								GENERIC_OAUTH_ERROR_CODES.TOKEN_URL_NOT_FOUND,
							);
						}
						const tokens = await validateAuthorizationCode({
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
							tokenEndpointAuth,
							additionalParams: c.tokenUrlParams,
						});
						return applyDefaultAccessTokenExpiry(
							tokens,
							c.accessTokenExpiresIn,
						);
					},
					async getUserInfo(tokens) {
						const { expectedIdTokenNonce, ...oauthTokens } = tokens;
						// Fail closed: when discovery published a JWKS, an id_token
						// that cannot be verified must not become an identity source.
						if (oauthTokens.idToken && provider.idToken) {
							const verified = await verifyProviderIdToken(
								provider,
								oauthTokens.idToken,
								expectedIdTokenNonce,
							);
							if (!verified) {
								ctx.logger.error(
									`Provider "${c.providerId}": id_token failed verification against the discovery JWKS or expected nonce`,
								);
								return null;
							}
						}
						const raw = c.getUserInfo
							? await c.getUserInfo(oauthTokens)
							: await fetchUserInfo(oauthTokens, userInfoUrl);
						if (!raw) {
							return null;
						}
						const mapped = c.mapProfileToUser
							? await c.mapProfileToUser(raw)
							: {};
						const rawId = isNonEmptyOAuthId(mapped.id)
							? mapped.id
							: isNonEmptyOAuthId(raw.id)
								? raw.id
								: isNonEmptyOAuthId(raw.sub)
									? raw.sub
									: undefined;
						if (rawId === undefined) {
							return null;
						}
						const user = {
							email: raw.email,
							emailVerified: raw.emailVerified,
							image: raw.image,
							name: raw.name,
							...mapped,
							id: String(rawId),
						};
						return {
							user: {
								...user,
								image: user.image ?? undefined,
							},
							data: raw,
						};
					},
					async refreshAccessToken(
						refreshToken: string,
						refreshCtx?: OAuthRefreshContext,
					): Promise<OAuth2Tokens> {
						if (!tokenUrl) {
							throw APIError.from(
								"BAD_REQUEST",
								GENERIC_OAUTH_ERROR_CODES.TOKEN_URL_NOT_FOUND,
							);
						}
						const resolvedRefreshParams =
							typeof c.refreshTokenParams === "function"
								? await c.refreshTokenParams(refreshCtx)
								: c.refreshTokenParams;
						const tokens = await refreshAccessToken({
							refreshToken,
							options: {
								clientId: c.clientId,
								clientSecret: c.clientSecret,
							},
							authentication: c.authentication,
							tokenEndpointAuth,
							tokenEndpoint: tokenUrl,
							extraParams: resolvedRefreshParams,
						});
						return applyDefaultAccessTokenExpiry(
							tokens,
							c.accessTokenExpiresIn,
						);
					},
					disableImplicitSignUp: c.disableImplicitSignUp,
					disableSignUp: c.disableSignUp,
					options: {
						disableSignUp: c.disableSignUp,
						overrideUserInfoOnSignIn: c.overrideUserInfo,
						requireEmailVerification: c.requireEmailVerification,
					},
				};
				genericProviders.push(provider);
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
