import type { AuthContext, BetterAuthPlugin } from "@better-auth/core";
import { createAuthMiddleware } from "@better-auth/core/api";
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
	| "endSessionEndpoint"
	| "postLogoutRedirectURI"
	| "disableProviderLogout"
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
	end_session_endpoint?: string;
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

/** A request waits on a discovery retry, so bound it (the SSO plugin uses 10s too). */
const DISCOVERY_RETRY_TIMEOUT_MS = 10_000;

type PendingDiscovery = Map<
	string,
	{ config: GenericOAuthConfig; attempt?: Promise<void> | undefined }
>;

/**
 * Providers skipped because startup discovery failed. Init stores them on each auth
 * instance's context, so one plugin object can serve several instances. It is a context
 * field rather than a WeakMap because requests see copies of the context, and a later
 * plugin may replace `socialProviders`.
 */
const getPendingDiscovery = (ctx: AuthContext) =>
	(ctx as AuthContext & { genericOAuthPendingDiscovery?: PendingDiscovery })
		.genericOAuthPendingDiscovery;

async function fetchDiscovery(
	url: string,
	headers?: Record<string, string>,
	timeout?: number,
): Promise<DiscoveryDocument | null> {
	const result = await betterFetch<DiscoveryDocument>(url, {
		method: "GET",
		headers,
		// betterFetch's `timeout` stops at the response headers; a signal also bounds the body.
		signal: timeout ? AbortSignal.timeout(timeout) : undefined,
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
	return {
		...userInfo.data,
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

	const buildProviders = async (
		configs: GenericOAuthConfig[],
		ctx: AuthContext,
		discoveryTimeout?: number,
	): Promise<OAuthProvider[]> => {
		const genericProviders: OAuthProvider[] = [];
		for (const c of configs) {
			let authorizationUrl = c.authorizationUrl;
			let tokenUrl = c.tokenUrl;
			let userInfoUrl = c.userInfoUrl;
			let endSessionEndpoint = c.endSessionEndpoint;

			let issuer: string | undefined;
			let isOidc = false;
			let idTokenConfig: OAuthIdTokenConfig | undefined;

			if (c.discoveryUrl) {
				const discovered = await fetchDiscovery(
					c.discoveryUrl,
					c.discoveryHeaders,
					discoveryTimeout,
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
					endSessionEndpoint ??= discovered.end_session_endpoint;
					issuer = discovered.issuer;
					const signingAlgs = discovered.id_token_signing_alg_values_supported;
					isOidc = Array.isArray(signingAlgs) && signingAlgs.length > 0;
					if (discovered.jwks_uri && discovered.issuer) {
						let jwksUrl: URL;
						try {
							jwksUrl = new URL(discovered.jwks_uri, c.discoveryUrl);
						} catch {
							ctx.logger.error(
								`Provider "${c.providerId}": invalid jwks_uri "${discovered.jwks_uri}" in discovery document. Provider skipped.`,
							);
							continue;
						}
						idTokenConfig = {
							jwks: createRemoteJWKSet(jwksUrl),
							issuer: discovered.issuer,
							audience: c.clientId,
							algorithms: isOidc ? signingAlgs : undefined,
						};
					}
				}
				if (!authorizationUrl || (!tokenUrl && !c.getToken)) {
					ctx.logger.error(
						`Provider "${c.providerId}": discovery left no usable authorization endpoint or token exchange. Provider skipped.`,
					);
					continue;
				}
			}
			if (c.requireIdTokenVerification && !idTokenConfig) {
				if (c.discoveryUrl) {
					ctx.logger.error(
						`Provider "${c.providerId}": requires verified ID tokens, but discovery did not provide a usable issuer and jwks_uri. Provider skipped.`,
					);
					continue;
				}
				throw new Error(
					`Provider "${c.providerId}": requires verified ID tokens, but discovery did not provide a usable issuer and jwks_uri.`,
				);
			}

			const tokenEndpointAuth = c.tokenEndpointAuth;
			if (c.clientSecret && isSecretlessTokenEndpointAuth(tokenEndpointAuth)) {
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

			const accountSubject = c.accountSubject;
			const provider: OAuthProvider = {
				id: c.providerId,
				name: c.name ?? c.providerId,
				issuer,
				accountSubject: ({ tokens, profile }) => {
					// AuthContext erases heterogeneous provider profile types. This
					// provider always emits GenericOAuthUserInfo from getUserInfo below.
					const genericProfile = profile as GenericOAuthUserInfo;
					if (accountSubject) {
						return accountSubject({ tokens, profile: genericProfile });
					}
					return isOidc
						? (genericProfile.sub ?? "")
						: (genericProfile.id ?? "");
				},
				idToken: idTokenConfig,
				requiresIdTokenNonce:
					idTokenConfig !== undefined && c.disableIdTokenNonceBinding !== true,
				allowIdpInitiated: c.allowIdpInitiated,
				async createEndSessionURL(data: {
					idToken?: string | null | undefined;
					postLogoutRedirectURI?: string | undefined;
					state?: string | undefined;
				}) {
					if (c.disableProviderLogout) {
						return null;
					}
					if (!endSessionEndpoint) {
						return null;
					}
					let url: URL;
					try {
						url = new URL(endSessionEndpoint);
					} catch {
						return null;
					}
					if (data.idToken) {
						url.searchParams.set("id_token_hint", data.idToken);
					}
					const configuredRedirectURI =
						data.postLogoutRedirectURI ?? c.postLogoutRedirectURI;
					const postLogoutRedirectURI = configuredRedirectURI
						? new URL(configuredRedirectURI, ctx.baseURL).toString()
						: undefined;
					if (postLogoutRedirectURI) {
						url.searchParams.set(
							"post_logout_redirect_uri",
							postLogoutRedirectURI,
						);
						url.searchParams.set("client_id", c.clientId);
						if (data.state) {
							url.searchParams.set("state", data.state);
						}
					} else if (!data.idToken) {
						url.searchParams.set("client_id", c.clientId);
					}
					return url;
				},
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
					return applyDefaultAccessTokenExpiry(tokens, c.accessTokenExpiresIn);
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
					const user = {
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
					return applyDefaultAccessTokenExpiry(tokens, c.accessTokenExpiresIn);
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
		return genericProviders;
	};

	// Concurrent requests share one retry, and a failed retry stays pending.
	const retryDiscovery = (ctx: AuthContext, providerId: string) => {
		const pendingDiscovery = getPendingDiscovery(ctx);
		const pending = pendingDiscovery?.get(providerId);
		if (!pending) return;
		pending.attempt ??= buildProviders(
			[pending.config],
			ctx,
			DISCOVERY_RETRY_TIMEOUT_MS,
		)
			.then(([provider]) => {
				if (!provider) return;
				pendingDiscovery?.delete(providerId);
				ctx.socialProviders.unshift(provider);
			})
			.finally(() => {
				pending.attempt = undefined;
			});
		return pending.attempt;
	};
	// shortcut: account routes that look the provider up from a stored account recover
	// only after a request names it; resolve the account here if that becomes a need.
	const requestedProviderId = (context: {
		body?: { provider?: unknown; providerId?: unknown } | undefined;
		query?: { provider?: unknown } | undefined;
		params?: { id?: unknown } | undefined;
	}) => {
		const id =
			context.body?.provider ??
			context.body?.providerId ??
			context.query?.provider ??
			context.params?.id;
		return typeof id === "string" ? id : undefined;
	};

	return {
		id: "generic-oauth",
		version: PACKAGE_VERSION,
		init: async (ctx: AuthContext) => {
			const genericProviders = await buildProviders(options.config, ctx);
			const built = new Set(genericProviders.map((p) => p.id));
			const genericOAuthPendingDiscovery: PendingDiscovery = new Map(
				options.config
					.filter((c) => !built.has(c.providerId))
					.map((c) => [c.providerId, { config: c }]),
			);

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
					genericOAuthPendingDiscovery,
				},
			};
		},
		hooks: {
			before: [
				{
					matcher: (context) =>
						getPendingDiscovery(context.context)?.has(
							requestedProviderId(context) ?? "",
						) === true,
					handler: createAuthMiddleware(async (ctx) => {
						await retryDiscovery(ctx.context, requestedProviderId(ctx) ?? "");
					}),
				},
			],
		},
		options,
		$ERROR_CODES: GENERIC_OAUTH_ERROR_CODES,
	} satisfies BetterAuthPlugin;
};
