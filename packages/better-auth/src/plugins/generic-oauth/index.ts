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

async function fetchDiscovery(
	url: string,
	headers?: Record<string, string>,
	signal?: AbortSignal,
): Promise<DiscoveryDocument | null> {
	const result = await betterFetch<DiscoveryDocument>(url, {
		method: "GET",
		headers,
		signal,
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

	return {
		id: "generic-oauth",
		version: PACKAGE_VERSION,
		init: async (ctx: AuthContext) => {
			const genericProviders: OAuthProvider[] = [];

			for (const c of options.config) {
				let authorizationUrl = c.authorizationUrl;
				let tokenUrl = c.tokenUrl;
				let userInfoUrl = c.userInfoUrl;
				let endSessionEndpoint = c.endSessionEndpoint;

				let issuer: string | undefined;
				let isOidc = false;
				let idTokenConfig: OAuthIdTokenConfig | undefined;

				/**
				 * Reason the latest discovery attempt left the provider unusable.
				 * Surfaced when a request arrives while discovery is still pending.
				 */
				let discoveryFailure: string | null = null;

				/**
				 * complete: a fetched discovery document was applied and the
				 * provider carries its full OIDC metadata. degraded: the fetch
				 * failed but explicit endpoints keep the provider usable; the
				 * metadata (issuer, JWKS, OIDC scope) is still missing, so
				 * discovery keeps retrying on use. failed: the provider is
				 * unusable; calls fail with 503 and discovery keeps retrying.
				 */
				type DiscoveryOutcome = "complete" | "degraded" | "failed";
				let discoveryComplete = !c.discoveryUrl;
				let discoveryInflight: Promise<DiscoveryOutcome> | null = null;

				// Explicit configuration, captured before discovery mutates
				// anything. Each attempt starts from these values, so a retry
				// never mixes endpoints from two different discovery documents.
				const explicitAuthorizationUrl = authorizationUrl;
				const explicitTokenUrl = tokenUrl;
				const explicitUserInfoUrl = userInfoUrl;
				const explicitEndSessionEndpoint = endSessionEndpoint;

				/**
				 * Fetch the discovery document and apply it on top of the explicit
				 * configuration. Values are committed only when a fetched
				 * document leaves the provider usable, so a failed attempt never
				 * half-applies a document. When the fetch fails but explicit
				 * endpoints are configured, the provider stays usable on those
				 * endpoints (as it did before lazy discovery existed) but
				 * reports "degraded", so discovery keeps retrying until the
				 * metadata self-heals.
				 */
				const resolveDiscovery = async (): Promise<DiscoveryOutcome> => {
					if (!c.discoveryUrl) {
						return "complete";
					}
					const discovered = await fetchDiscovery(
						c.discoveryUrl,
						c.discoveryHeaders,
						// A stalled IdP must not hang sign-in: discovery is retried
						// on use, so every attempt runs under a timeout.
						AbortSignal.timeout(c.discoveryTimeout ?? 5000),
					).catch((err) => {
						ctx.logger.error(
							`Discovery fetch failed for "${c.providerId}": ${err}`,
						);
						return null;
					});
					let nextAuthorizationUrl = explicitAuthorizationUrl;
					let nextTokenUrl = explicitTokenUrl;
					let nextUserInfoUrl = explicitUserInfoUrl;
					let nextEndSessionEndpoint = explicitEndSessionEndpoint;
					let nextIssuer: string | undefined;
					let nextIsOidc = false;
					let nextIdTokenConfig: OAuthIdTokenConfig | undefined;
					if (discovered) {
						nextAuthorizationUrl ??= discovered.authorization_endpoint;
						nextTokenUrl ??= discovered.token_endpoint;
						nextUserInfoUrl ??= discovered.userinfo_endpoint;
						nextEndSessionEndpoint ??= discovered.end_session_endpoint;
						nextIssuer = discovered.issuer;
						const signingAlgs =
							discovered.id_token_signing_alg_values_supported;
						nextIsOidc = Array.isArray(signingAlgs) && signingAlgs.length > 0;
						if (discovered.jwks_uri && discovered.issuer) {
							let jwksUrl: URL;
							try {
								jwksUrl = new URL(discovered.jwks_uri, c.discoveryUrl);
							} catch {
								discoveryFailure = `invalid jwks_uri "${discovered.jwks_uri}" in discovery document`;
								return "failed";
							}
							nextIdTokenConfig = {
								jwks: createRemoteJWKSet(jwksUrl),
								issuer: discovered.issuer,
								audience: c.clientId,
								algorithms: nextIsOidc ? signingAlgs : undefined,
							};
						}
					}
					if (!nextAuthorizationUrl || (!nextTokenUrl && !c.getToken)) {
						discoveryFailure = discovered
							? "discovery left no usable authorization endpoint or token exchange"
							: "the discovery document could not be fetched";
						return "failed";
					}
					if (c.requireIdTokenVerification && !nextIdTokenConfig) {
						discoveryFailure =
							"requires verified ID tokens, but discovery did not provide a usable issuer and jwks_uri";
						return "failed";
					}
					if (!discovered) {
						// Explicit endpoints keep the provider usable, but the
						// discovery metadata is still missing. Report "degraded"
						// instead of resolving: a later call retries and self-heals
						// the metadata once the IdP is reachable again.
						discoveryFailure = "the discovery document could not be fetched";
						return "degraded";
					}
					authorizationUrl = nextAuthorizationUrl;
					tokenUrl = nextTokenUrl;
					userInfoUrl = nextUserInfoUrl;
					endSessionEndpoint = nextEndSessionEndpoint;
					issuer = nextIssuer;
					isOidc = nextIsOidc;
					idTokenConfig = nextIdTokenConfig;
					discoveryFailure = null;
					return "complete";
				};

				if (c.discoveryUrl) {
					const outcome = await resolveDiscovery();
					discoveryComplete = outcome === "complete";
					if (outcome === "failed") {
						ctx.logger.warn(
							`Provider "${c.providerId}": ${discoveryFailure}. Provider registered and discovery will be retried on first use.`,
						);
					} else if (outcome === "degraded") {
						ctx.logger.warn(
							`Provider "${c.providerId}": ${discoveryFailure}. Provider registered with its explicit endpoints; discovery metadata will be retried on use.`,
						);
					}
				}
				if (c.requireIdTokenVerification && !idTokenConfig && !c.discoveryUrl) {
					throw new Error(
						`Provider "${c.providerId}": requires verified ID tokens, but discovery did not provide a usable issuer and jwks_uri.`,
					);
				}

				/**
				 * Retry discovery for a provider whose startup discovery did not
				 * complete. Concurrent callers share a single in-flight attempt.
				 * A degraded provider (explicit endpoints, metadata missing)
				 * stays usable while the retry repeats; a failed provider
				 * throws 503.
				 */
				const ensureDiscovery = async (): Promise<void> => {
					if (discoveryComplete) {
						return;
					}
					discoveryInflight ??= resolveDiscovery()
						.then((outcome) => {
							if (outcome === "complete") {
								discoveryComplete = true;
								// Publish the late-resolved OIDC metadata on the provider;
								// these were captured by value at construction time.
								provider.issuer = issuer;
								provider.idToken = idTokenConfig;
								// Only relaxes nonce binding (when the provider turns out
								// not to be OIDC); it never turns on late, because core
								// already minted the nonce before this retry ran.
								provider.requiresIdTokenNonce =
									idTokenConfig !== undefined &&
									c.disableIdTokenNonceBinding !== true;
							}
							return outcome;
						})
						.finally(() => {
							discoveryInflight = null;
						});
					if ((await discoveryInflight) === "failed") {
						throw APIError.from("SERVICE_UNAVAILABLE", {
							code: GENERIC_OAUTH_ERROR_CODES.OAUTH_PROVIDER_UNAVAILABLE.code,
							message: `Provider "${c.providerId}" is temporarily unavailable: ${discoveryFailure ?? "discovery has not succeeded yet"}.`,
						});
					}
				};

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
						if (isOidc) {
							return genericProfile.sub ?? "";
						}
						// A discovery-configured provider can complete discovery
						// after accounts already exist (lazy retry). Keep the
						// identity rule independent of when discovery succeeded:
						// `sub` whenever the profile carries it, so a healed
						// provider cannot drift account identity between the
						// profile's `id` and `sub` fields.
						if (c.discoveryUrl) {
							return genericProfile.sub ?? genericProfile.id ?? "";
						}
						return genericProfile.id ?? "";
					},
					idToken: idTokenConfig,
					// Mint the nonce whenever a pending discovery could still turn
					// nonce binding on: core mints the nonce before calling
					// createAuthorizationURL, so binding must already be on here.
					// Once discovery resolves, binding only ever relaxes (see
					// ensureDiscovery), so a state minted with a nonce never fails
					// its callback for wanting one.
					requiresIdTokenNonce:
						c.disableIdTokenNonceBinding !== true &&
						(idTokenConfig !== undefined || !discoveryComplete),
					allowIdpInitiated: c.allowIdpInitiated,
					async createEndSessionURL(data: {
						idToken?: string | null | undefined;
						postLogoutRedirectURI?: string | undefined;
						state?: string | undefined;
					}) {
						if (c.disableProviderLogout) {
							return null;
						}
						try {
							await ensureDiscovery();
						} catch {
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
					async createAuthorizationURL(data) {
						await ensureDiscovery();
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
						await ensureDiscovery();
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
						await ensureDiscovery();
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
						await ensureDiscovery();
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
