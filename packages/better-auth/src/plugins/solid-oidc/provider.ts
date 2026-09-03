import type { AuthContext } from "@better-auth/core";
import { APIError } from "@better-auth/core/error";
import type {
	OAuth2Tokens,
	OAuthProvider,
	TokenEndpointRequestContext,
} from "@better-auth/core/oauth2";
import {
	applyDefaultAccessTokenExpiry,
	createAuthorizationURL,
	encodeBasicCredentials,
	refreshAccessToken,
	validateAuthorizationCode,
} from "@better-auth/core/oauth2";
import { betterFetch } from "@better-fetch/fetch";
import type { JWTPayload, JWTVerifyGetKey } from "jose";
import { createRemoteJWKSet, customFetch, jwtVerify } from "jose";
import type { SolidDpopKeyPair } from "./dpop";
import {
	createSolidDpopProof,
	DEFAULT_SOLID_DPOP_ALGORITHM,
	generateSolidDpopKeyPair,
} from "./dpop";
import { SOLID_OIDC_ERROR_CODES } from "./error-codes";
import type { SolidDpopKeyStore } from "./key-store";
import type {
	SolidOidcConfig,
	SolidOidcProfile,
	SolidProviderMetadata,
} from "./types";
import {
	redirectRefusingFetch,
	trimTrailingSlash,
	webIdPlaceholderEmail,
} from "./utils";
import {
	canonicalizeIssuer,
	extractWebId,
	fetchWebIdOidcIssuers,
	haveSameAuthority,
} from "./webid";

function resolveAgainst(value: string, base: string) {
	return new URL(value, base).toString();
}

export interface CreateSolidProviderInput {
	config: SolidOidcConfig;
	ctx: AuthContext;
	keyStore: SolidDpopKeyStore;
	providerId: string;
	/** Resolved once at init so the authorization request and the served Client Identifier Document agree. */
	clientId: string;
	scopes: string[];
}

/**
 * Memoized discovery: the metadata is fetched on first use rather than at
 * startup, so a provider that is briefly unreachable does not stop the process
 * from booting. A failed fetch clears the cache so the next request retries.
 */
function createMetadataResolver(
	config: SolidOidcConfig,
	providerId: string,
	ctx: AuthContext,
) {
	const discoveryUrl =
		config.discoveryUrl ??
		`${trimTrailingSlash(config.issuer)}/.well-known/openid-configuration`;
	let pending: Promise<SolidProviderMetadata> | undefined;

	const fetchMetadata = async (): Promise<SolidProviderMetadata> => {
		const { data, error } = await betterFetch<SolidProviderMetadata>(
			discoveryUrl,
			{ method: "GET", headers: config.discoveryHeaders },
		);
		if (error || !data) {
			throw APIError.from(
				"BAD_GATEWAY",
				SOLID_OIDC_ERROR_CODES.SOLID_ISSUER_DISCOVERY_FAILED,
			);
		}
		for (const required of [
			"issuer",
			"authorization_endpoint",
			"token_endpoint",
			"jwks_uri",
		] as const) {
			if (typeof data[required] !== "string" || data[required].length === 0) {
				throw APIError.from(
					"BAD_GATEWAY",
					SOLID_OIDC_ERROR_CODES.SOLID_ISSUER_DISCOVERY_FAILED,
				);
			}
		}
		// OpenID Connect Discovery requires the document's `issuer` to equal the
		// issuer it was retrieved for. The configured value defines the account
		// namespace, so a mismatch has to fail rather than silently re-point the
		// provider at a different authority.
		if (canonicalizeIssuer(data.issuer) !== canonicalizeIssuer(config.issuer)) {
			// An APIError rather than a bare throw: this is a reachable
			// misconfiguration, and a bare throw would surface to the caller as an
			// unhandled 500 with a stack trace instead of a diagnosable failure.
			ctx.logger.error(
				`Solid-OIDC provider "${providerId}": discovery document issuer "${data.issuer}" does not match the configured issuer "${config.issuer}"`,
			);
			throw APIError.from(
				"BAD_GATEWAY",
				SOLID_OIDC_ERROR_CODES.SOLID_ISSUER_MISMATCH,
			);
		}
		return {
			...data,
			authorization_endpoint: resolveAgainst(
				data.authorization_endpoint,
				discoveryUrl,
			),
			token_endpoint: resolveAgainst(data.token_endpoint, discoveryUrl),
			jwks_uri: resolveAgainst(data.jwks_uri, discoveryUrl),
			userinfo_endpoint: data.userinfo_endpoint
				? resolveAgainst(data.userinfo_endpoint, discoveryUrl)
				: undefined,
			end_session_endpoint: data.end_session_endpoint
				? resolveAgainst(data.end_session_endpoint, discoveryUrl)
				: undefined,
		};
	};

	return () => {
		pending ??= fetchMetadata().catch((error) => {
			pending = undefined;
			throw error;
		});
		return pending;
	};
}

/** Memoized JWKS resolver, keyed by the discovered `jwks_uri`. */
function createJwksResolver() {
	const byUri = new Map<string, JWTVerifyGetKey>();
	return (jwksUri: string) => {
		let jwks = byUri.get(jwksUri);
		if (!jwks) {
			jwks = createRemoteJWKSet(new URL(jwksUri), {
				[customFetch]: redirectRefusingFetch,
			});
			byUri.set(jwksUri, jwks);
		}
		return jwks;
	};
}

export function createSolidProvider({
	config,
	ctx,
	keyStore,
	providerId,
	clientId,
	scopes: configuredScopes,
}: CreateSolidProviderInput): OAuthProvider {
	const getMetadata = createMetadataResolver(config, providerId, ctx);
	const getJwks = createJwksResolver();
	const issuer = canonicalizeIssuer(config.issuer) ?? config.issuer;
	const dpopAlgorithm = config.dpop?.algorithm ?? DEFAULT_SOLID_DPOP_ALGORITHM;
	const persistRefreshKeys = config.dpop?.persistRefreshKeys ?? true;
	const requireDpopBoundTokens = config.dpop?.requireDpopBoundTokens ?? true;
	const requireWebIdIssuerConfirmation =
		config.requireWebIdIssuerConfirmation ?? true;
	const trustIssuerHostedWebId = config.trustIssuerHostedWebId ?? true;
	const authMethod =
		config.tokenEndpointAuthMethod ??
		(config.clientSecret ? "client_secret_basic" : "none");

	/**
	 * Applies client authentication and the DPoP proof to a token request.
	 *
	 * The `custom` token-endpoint strategy replaces Better Auth's built-in
	 * client authentication rather than running alongside it, so the client
	 * credentials are set here too.
	 */
	const customizeTokenRequest =
		(keyPair: SolidDpopKeyPair) =>
		async (request: TokenEndpointRequestContext) => {
			if (authMethod === "client_secret_basic") {
				request.headers.authorization = encodeBasicCredentials(
					clientId,
					config.clientSecret!,
				);
			} else if (authMethod === "client_secret_post") {
				request.body.set("client_id", clientId);
				request.body.set("client_secret", config.clientSecret!);
			} else {
				request.body.set("client_id", clientId);
			}
			request.headers.dpop = await createSolidDpopProof({
				keyPair,
				method: "POST",
				url: request.tokenEndpoint,
			});
		};

	/**
	 * RFC 9449 §5: a DPoP-bound token response carries `token_type: DPoP`. A
	 * Solid provider that answers `Bearer` did not apply the sender constraint,
	 * which would leave a bearer token where the deployment expects a bound one.
	 */
	const assertDpopBound = (tokens: OAuth2Tokens) => {
		if (!requireDpopBoundTokens) return;
		if (tokens.tokenType?.toLowerCase() === "dpop") return;
		ctx.logger.error(
			`Solid-OIDC provider "${providerId}": token response token_type is "${tokens.tokenType ?? "missing"}", expected "DPoP". Set dpop.requireDpopBoundTokens to false only if this provider is known not to support DPoP.`,
		);
		throw APIError.from(
			"BAD_GATEWAY",
			SOLID_OIDC_ERROR_CODES.TOKEN_NOT_DPOP_BOUND,
		);
	};

	/**
	 * Verifies the ID token against the provider's JWKS and returns its claims.
	 *
	 * Verification happens here rather than through the shared provider
	 * `idToken` config because the WebID claim has to be read from the verified
	 * payload, and because client-submitted ID-token sign-in stays disabled for
	 * this provider: such a token arrives with no PKCE exchange and no DPoP
	 * binding.
	 */
	const verifyIdToken = async (
		idToken: string,
		expectedNonce: string | undefined,
	): Promise<JWTPayload> => {
		const metadata = await getMetadata();
		const { payload } = await jwtVerify(idToken, getJwks(metadata.jwks_uri), {
			issuer: metadata.issuer,
			audience: clientId,
			algorithms: metadata.id_token_signing_alg_values_supported,
		});
		if (expectedNonce && payload.nonce !== expectedNonce) {
			throw new Error(
				"ID token nonce does not match the authorization request",
			);
		}
		// OpenID Connect Core 1.0 §3.1.3.7: when `azp` is present it names the
		// party the token was issued to, and it must be this client.
		if (typeof payload.azp === "string" && payload.azp !== clientId) {
			throw new Error(
				`ID token azp "${payload.azp}" does not match this client`,
			);
		}
		return payload;
	};

	/**
	 * Establishes that this provider is allowed to speak for `webId`.
	 *
	 * Without this check, every configured provider could assert any WebID,
	 * including one that belongs to a user of a different pod, and Better Auth
	 * would link it to that user's account.
	 *
	 * @see https://solidproject.org/TR/oidc#webid-issuer
	 */
	const confirmWebIdIssuer = async (
		webId: string,
	): Promise<
		Pick<SolidOidcProfile, "webIdIssuers" | "webIdIssuerConfirmation">
	> => {
		if (!requireWebIdIssuerConfirmation) {
			return { webIdIssuers: [], webIdIssuerConfirmation: "skipped" };
		}
		// A provider that serves the WebID document already controls its
		// contents, so reading the document back adds no guarantee.
		if (trustIssuerHostedWebId && haveSameAuthority(webId, issuer)) {
			return { webIdIssuers: [], webIdIssuerConfirmation: "issuer-hosted" };
		}
		const issuers = config.getWebIdIssuers
			? await config.getWebIdIssuers({ webId, issuer })
			: (await fetchWebIdOidcIssuers({ webId })).issuers;
		const confirmed = issuers.some(
			(candidate) => canonicalizeIssuer(candidate) === issuer,
		);
		if (!confirmed) {
			throw new Error(
				`WebID "${webId}" does not list "${issuer}" as a trusted OpenID Provider (found: ${issuers.length ? issuers.join(", ") : "none"})`,
			);
		}
		return { webIdIssuers: issuers, webIdIssuerConfirmation: "webid-document" };
	};

	const provider: OAuthProvider = {
		id: providerId,
		name: config.name ?? providerId,
		issuer,
		accountIssuer: issuer,
		// The WebID, not the provider's local `sub`: it is the identifier the rest
		// of the Solid ecosystem knows the user by, and it is stable if the
		// provider ever re-issues subjects.
		accountSubject: ({ profile }) => (profile as SolidOidcProfile).webid,
		requiresIdTokenNonce: true,
		disableSignUp: config.disableSignUp,
		disableImplicitSignUp: config.disableImplicitSignUp,
		options: {
			disableSignUp: config.disableSignUp,
			overrideUserInfoOnSignIn: config.overrideUserInfo,
			// A client-submitted ID token carries no PKCE exchange and no DPoP
			// binding, so this provider only accepts identities that came through
			// the authorization code flow it started.
			disableIdTokenSignIn: true,
		},

		async createAuthorizationURL(data) {
			const metadata = await getMetadata();
			return createAuthorizationURL({
				id: providerId,
				options: {
					clientId,
					clientSecret: config.clientSecret,
					redirectURI: config.redirectURI,
				},
				authorizationEndpoint: metadata.authorization_endpoint,
				state: data.state,
				// Solid-OIDC mandates the authorization code flow with PKCE.
				codeVerifier: data.codeVerifier,
				scopes: [...new Set([...(data.scopes ?? []), ...configuredScopes])],
				redirectURI: data.redirectURI,
				prompt: config.prompt,
				nonce: data.idTokenNonce,
				loginHint: data.loginHint,
				additionalParams: {
					...(config.authorizationUrlParams ?? {}),
					...(data.additionalParams ?? {}),
				},
			});
		},

		async validateAuthorizationCode(data) {
			const metadata = await getMetadata();
			const keyPair = await generateSolidDpopKeyPair(dpopAlgorithm);
			const tokens = await validateAuthorizationCode({
				code: data.code,
				codeVerifier: data.codeVerifier,
				redirectURI: data.redirectURI,
				options: {
					clientId,
					clientSecret: config.clientSecret,
					redirectURI: config.redirectURI,
				},
				tokenEndpoint: metadata.token_endpoint,
				tokenEndpointAuth: {
					method: "custom",
					customizeRequest: customizeTokenRequest(keyPair),
				},
			});
			assertDpopBound(tokens);
			if (persistRefreshKeys && tokens.refreshToken) {
				await keyStore.save({
					providerId,
					refreshToken: tokens.refreshToken,
					keyPair,
					refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
				});
			}
			await config.onTokenExchange?.({
				providerId,
				keyPair,
				accessToken: tokens.accessToken,
				refreshToken: tokens.refreshToken,
			});
			return applyDefaultAccessTokenExpiry(tokens, config.accessTokenExpiresIn);
		},

		async getUserInfo(tokens) {
			const { expectedIdTokenNonce, idToken } = tokens;
			if (!idToken) {
				ctx.logger.error(
					`Solid-OIDC provider "${providerId}": the token response contained no ID token, so no WebID could be established`,
				);
				return null;
			}
			let claims: JWTPayload;
			try {
				claims = await verifyIdToken(idToken, expectedIdTokenNonce);
			} catch (error) {
				ctx.logger.error(
					`Solid-OIDC provider "${providerId}": ID token verification failed. ${error}`,
				);
				return null;
			}
			const webid = extractWebId(claims as Record<string, unknown>);
			if (!webid) {
				ctx.logger.error(
					`Solid-OIDC provider "${providerId}": the ID token has no "webid" claim and its "sub" is not an absolute http(s) URI`,
				);
				return null;
			}
			let confirmation: Pick<
				SolidOidcProfile,
				"webIdIssuers" | "webIdIssuerConfirmation"
			>;
			try {
				confirmation = await confirmWebIdIssuer(webid);
			} catch (error) {
				ctx.logger.error(
					`Solid-OIDC provider "${providerId}": WebID issuer confirmation failed. ${error}`,
				);
				return null;
			}

			const profile: SolidOidcProfile = {
				webid,
				sub: typeof claims.sub === "string" ? claims.sub : webid,
				iss: issuer,
				azp: typeof claims.azp === "string" ? claims.azp : undefined,
				name: typeof claims.name === "string" ? claims.name : undefined,
				...confirmation,
				claims: claims as Record<string, unknown>,
			};

			const mapped = (await config.mapProfileToUser?.(profile)) ?? {};
			const email = mapped.email ?? (await webIdPlaceholderEmail(webid));
			return {
				user: {
					name: profile.name ?? webid,
					...mapped,
					email,
					// A Solid ID token asserts control of a WebID, not of an e-mail
					// address, so nothing here can mark an address verified.
					emailVerified: mapped.emailVerified ?? false,
				},
				data: profile,
			};
		},

		async refreshAccessToken(refreshToken) {
			const metadata = await getMetadata();
			const keyPair = persistRefreshKeys
				? await keyStore.load({ providerId, refreshToken })
				: null;
			if (!keyPair) {
				// Refreshing with a fresh key would fail the provider's `cnf` check
				// anyway; failing here says why, and the user can re-authenticate.
				throw APIError.from(
					"BAD_REQUEST",
					SOLID_OIDC_ERROR_CODES.DPOP_KEY_NOT_FOUND,
				);
			}
			const tokens = await refreshAccessToken({
				refreshToken,
				options: { clientId, clientSecret: config.clientSecret },
				tokenEndpoint: metadata.token_endpoint,
				tokenEndpointAuth: {
					method: "custom",
					customizeRequest: customizeTokenRequest(keyPair),
				},
			});
			assertDpopBound(tokens);
			await keyStore.rebind({
				providerId,
				previousRefreshToken: refreshToken,
				refreshToken: tokens.refreshToken ?? refreshToken,
				refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
			});
			await config.onTokenExchange?.({
				providerId,
				keyPair,
				accessToken: tokens.accessToken,
				refreshToken: tokens.refreshToken,
			});
			return applyDefaultAccessTokenExpiry(tokens, config.accessTokenExpiresIn);
		},

		async createEndSessionURL(data) {
			if (config.disableProviderLogout) return null;
			const metadata = await getMetadata().catch(() => null);
			if (!metadata?.end_session_endpoint) return null;
			const url = new URL(metadata.end_session_endpoint);
			if (data.idToken) {
				url.searchParams.set("id_token_hint", data.idToken);
			}
			const configured =
				data.postLogoutRedirectURI ?? config.postLogoutRedirectURI;
			if (configured) {
				url.searchParams.set(
					"post_logout_redirect_uri",
					new URL(configured, ctx.baseURL).toString(),
				);
				url.searchParams.set("client_id", clientId);
				if (data.state) url.searchParams.set("state", data.state);
			} else if (!data.idToken) {
				url.searchParams.set("client_id", clientId);
			}
			return url;
		},
	};

	return provider;
}
