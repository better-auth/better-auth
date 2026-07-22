import type { JWTVerifyGetKey } from "jose";
import type {
	Awaitable,
	GenericEndpointContext,
	LiteralString,
} from "../types";

/**
 * id_token verification config for a social provider.
 *
 * Declares how a client-submitted id_token is verified. The shared verifier
 * (`verifyProviderIdToken`) consumes this instead of each provider implementing its own
 * boolean check, so verification is centralized and fail-closed: a provider without a config
 * cannot accept a forged token by omission.
 */
export type OAuthIdTokenConfig =
	| {
			/**
			 * JWKS resolver used to verify the JWS signature. Accepts a jose
			 * `createRemoteJWKSet` resolver or a key-resolving function
			 * `(protectedHeader) => key`.
			 */
			jwks: JWTVerifyGetKey;
			/** Expected `iss`. Omit for providers whose issuer varies per tenant. */
			issuer?: (string | string[]) | undefined;
			/** Expected `aud`, usually the client ID. */
			audience: string | string[];
			/** Permitted JWS algorithms. Defaults to the token's `alg` header. */
			algorithms?: string[] | undefined;
			/** Maximum token age passed to jose (e.g. `"1h"`). */
			maxTokenAge?: string | undefined;
			/**
			 * How the `nonce` claim is compared to the expected nonce.
			 * - `"exact"` (default): strict equality.
			 * - `"exact-or-sha256"`: matches the raw nonce or its SHA-256 hex digest (Apple).
			 */
			nonceComparison?: ("exact" | "exact-or-sha256") | undefined;
			/**
			 * Accept non-JWS (opaque) tokens without signature verification. Identity is then
			 * resolved by getUserInfo from the access token via the provider userinfo endpoint,
			 * which validates it (e.g. Facebook Graph access tokens).
			 */
			allowOpaqueToken?: boolean | undefined;
			/**
			 * Provider-specific claim check applied after the signature, issuer,
			 * audience, max-age, and nonce checks pass. Return `false` to reject the
			 * token. Used to enforce constraints the standard checks cannot express,
			 * e.g. Google's hosted-domain (`hd`) restriction. Omitted by providers
			 * that have no extra claim requirement.
			 */
			verifyClaims?: ((claims: Record<string, unknown>) => boolean) | undefined;
	  }
	| {
			/**
			 * Custom verifier for providers that cannot verify against a local JWKS, such as a
			 * remote verification endpoint (e.g. LINE).
			 */
			verify: (
				token: string,
				nonce?: string,
				ctx?: GenericEndpointContext,
			) => Promise<boolean>;
	  };

export interface OAuth2Tokens {
	tokenType?: string | undefined;
	accessToken?: string | undefined;
	refreshToken?: string | undefined;
	accessTokenExpiresAt?: Date | undefined;
	refreshTokenExpiresAt?: Date | undefined;
	scopes?: string[] | undefined;
	idToken?: string | undefined;
	/**
	 * Raw token response from the provider.
	 * Preserves provider-specific fields that are not part of the standard OAuth2 token response.
	 */
	raw?: Record<string, unknown> | undefined;
}

/** Mutable local-user attributes normalized from an OAuth provider profile. */
export type OAuth2UserInfo = {
	/** Provider identity belongs in raw profile data and `accountSubject`. */
	id?: never;
	name?: string | undefined;
	email?: (string | null) | undefined;
	image?: string | undefined;
	emailVerified: boolean;
};

/**
 * Verified provider data available when deriving a stable OAuth account key.
 *
 * Account-key resolvers must use the raw provider profile or verified token
 * response. They never receive the mapped local user, so profile mapping
 * cannot redefine provider identity.
 */
export interface OAuthAccountKeyContext<Profile extends object = object> {
	tokens: OAuth2Tokens;
	profile: Profile;
}

/**
 * Resolves one part of an account key from a profile returned by the same
 * provider. The method-derived callback keeps that profile pairing intact when
 * providers with different profile shapes share an `OAuthProvider[]`.
 */
type OAuthAccountKeyResolver<Profile extends object, Value> = {
	resolve(context: OAuthAccountKeyContext<Profile>): Awaitable<Value>;
}["resolve"];

/** Resolves the stable provider subject used to build an OAuth account key. */
export type OAuthAccountSubject<Profile extends object = object> =
	OAuthAccountKeyResolver<Profile, string | number>;

/** Mutable local-user attributes returned by `mapProfileToUser`. */
export type OAuthMappedUser = {
	/** Provider identity is defined by `accountSubject`, not local user mapping. */
	id?: never;
	name?: string;
	email?: string | null;
	image?: string;
	emailVerified?: boolean;
	[key: string]: unknown;
};

/**
 * Request metadata available to provider refresh hooks.
 *
 * The refresh flow may be triggered by endpoints such as `getAccessToken` or
 * `refreshToken`; this context gives provider hooks access to the triggering
 * request without exposing the full endpoint implementation surface.
 */
export interface OAuthRefreshContext {
	headers?: Headers | undefined;
	request?: Request | undefined;
}

export interface OAuthProvider<
	T extends object = object,
	O extends object = Partial<ProviderOptions>,
> {
	id: LiteralString;
	/**
	 * Optional path under the resolved per-request `baseURL` where this
	 * provider's OAuth callback handler is mounted. Providers that use the
	 * shared `/callback/<id>` route can omit this.
	 *
	 * Custom paths must start with `/`.
	 *
	 * Endpoints compose `redirectURI = ctx.context.baseURL + callbackPath` per
	 * request, so the provider must not hardcode an origin or `baseURL` here.
	 */
	callbackPath?: string | undefined;
	createAuthorizationURL: (data: {
		state: string;
		codeVerifier: string;
		scopes?: string[] | undefined;
		redirectURI: string;
		display?: string | undefined;
		loginHint?: string | undefined;
		/**
		 * OIDC nonce generated by the redirect initiator and persisted in OAuth
		 * state. Providers that set `requiresIdTokenNonce` must forward this to
		 * the authorization URL as the `nonce` parameter.
		 */
		idTokenNonce?: string | undefined;
		/**
		 * Extra query parameters to append to the authorization URL.
		 * Providers forward these to the shared `createAuthorizationURL` helper,
		 * which drops any keys present in `RESERVED_AUTHORIZATION_PARAMS`
		 * before applying them.
		 */
		additionalParams?: Record<string, string> | undefined;
	}) => Awaitable<URL>;
	name: string;
	/**
	 * Stable subject that identifies the provider account.
	 *
	 * Read this value from the raw, provider-verified profile. For OpenID
	 * Connect providers, use the `sub` claim. For OAuth providers, use the
	 * provider's documented immutable user identifier. Never derive this value
	 * from `mapProfileToUser`.
	 */
	accountSubject: OAuthAccountSubject<T>;
	validateAuthorizationCode: (data: {
		code: string;
		redirectURI: string;
		codeVerifier?: string | undefined;
		deviceId?: string | undefined;
	}) => Promise<OAuth2Tokens | null>;
	getUserInfo: (
		token: OAuth2Tokens & {
			/**
			 * OIDC nonce recovered from OAuth state. Providers that required an
			 * ID-token nonce must pass this to `verifyProviderIdToken` before
			 * trusting ID-token claims.
			 */
			expectedIdTokenNonce?: string | undefined;
			/**
			 * The user object from the provider
			 * This is only available for some providers like Apple
			 */
			user?:
				| {
						name?: {
							firstName?: string;
							lastName?: string;
						};
						email?: string;
				  }
				| undefined;
		},
	) => Promise<{
		user: OAuth2UserInfo;
		data: T;
	} | null>;
	/**
	 * Custom function to refresh a token.
	 *
	 * Receives request metadata from the endpoint that triggered the refresh.
	 * Providers that don't need request-scoped data can ignore the second
	 * argument.
	 */
	refreshAccessToken?:
		| ((
				refreshToken: string,
				ctx?: OAuthRefreshContext,
		  ) => Promise<OAuth2Tokens>)
		| undefined;
	revokeToken?: ((token: string) => Promise<void>) | undefined;
	/**
	 * Declarative id_token verification config consumed by the shared
	 * `verifyProviderIdToken` verifier. Providers set this instead of implementing a boolean
	 * verify method, which keeps verification centralized and fail-closed.
	 */
	idToken?: OAuthIdTokenConfig | undefined;
	/**
	 * The expected issuer identifier for this provider (RFC 9207).
	 * When set, the callback handler validates the `iss` query parameter
	 * against this value to prevent authorization server mix-up attacks.
	 */
	issuer?: string | undefined;
	/**
	 * Stable issuer used with the provider subject to recognize an account.
	 *
	 * Use the validated OpenID Connect issuer for OIDC providers. A resolver is
	 * supported for tenant-specific issuers and receives only provider-verified
	 * data. OAuth providers without an issuer omit this property and are scoped
	 * to the synthetic `local:oauth:<encoded providerId>` issuer, where the
	 * provider ID segment is percent-encoded.
	 */
	accountIssuer?: string | OAuthAccountKeyResolver<T, string> | undefined;
	/**
	 * Require shared OAuth redirect routes to bind ID-token verification to an
	 * authorization request nonce. When true, routes generate `idTokenNonce`,
	 * pass it to `createAuthorizationURL`, persist it in state, and provide it
	 * back to `getUserInfo` as `expectedIdTokenNonce`.
	 */
	requiresIdTokenNonce?: boolean | undefined;
	/**
	 * Disable implicit sign up for new users. When set to true for the provider,
	 * sign-in need to be called with with requestSignUp as true to create new users.
	 */
	disableImplicitSignUp?: boolean | undefined;
	/**
	 * Disable sign up for new users.
	 */
	disableSignUp?: boolean | undefined;
	/**
	 * Accept callbacks that arrive without a `state` parameter. When true,
	 * the shared OAuth callback handler restarts the flow server-side with
	 * fresh `state` and PKCE instead of rejecting the request. Intended for
	 * providers that initiate OAuth without RP-side flow kickoff (e.g.
	 * Clever). Leave unset for any provider that always initiates from the
	 * RP.
	 *
	 * @default false
	 */
	allowIdpInitiated?: boolean | undefined;
	/**
	 * Options for the provider
	 */
	options?: O | undefined;
}

/**
 * Maps a provider-specific profile while remaining compatible with the erased
 * profile type used by shared OAuth helpers.
 */
type OAuthProfileMapper<Profile extends object> = {
	map(profile: Profile): Awaitable<OAuthMappedUser>;
}["map"];

export type ProviderOptions<Profile extends object = object> = {
	/**
	 * The client ID of your application.
	 *
	 * Some providers accept multiple platform client IDs. The first entry is the
	 * primary client ID used for token endpoint client authentication.
	 */
	clientId?: LiteralString | string[] | undefined;
	/**
	 * The client secret of your application
	 */
	clientSecret?: string | undefined;
	/**
	 * The scopes you want to request from the provider
	 */
	scope?: string[] | undefined;
	/**
	 * Remove default scopes of the provider
	 */
	disableDefaultScope?: boolean | undefined;
	/**
	 * The redirect URL for your application. This is where the provider will
	 * redirect the user after the sign in process. Make sure this URL is
	 * whitelisted in the provider's dashboard.
	 */
	redirectURI?: string | undefined;
	/**
	 * Custom authorization endpoint URL.
	 * Use this to override the default authorization endpoint of the provider.
	 * Useful for testing with local OAuth servers or using sandbox environments.
	 */
	authorizationEndpoint?: string | undefined;
	/**
	 * The client key of your application
	 * Tiktok Social Provider uses this field instead of clientId
	 */
	clientKey?: string | undefined;
	/**
	 * Disable provider from allowing users to sign in
	 * with this provider with an id token sent from the
	 * client.
	 */
	disableIdTokenSignIn?: boolean | undefined;
	/**
	 * verifyIdToken function to verify the id token.
	 *
	 * The optional endpoint context exposes request metadata to custom
	 * verifiers without coupling built-in provider verification to a runtime.
	 */
	verifyIdToken?:
		| ((
				token: string,
				nonce?: string,
				ctx?: GenericEndpointContext,
		  ) => Promise<boolean>)
		| undefined;
	/**
	 * Custom function to get user info from the provider
	 *
	 * `data` must preserve the declared raw profile shape because account-key
	 * resolvers consume it after this hook returns.
	 */
	getUserInfo?:
		| ((token: OAuth2Tokens) => Promise<{
				user: OAuth2UserInfo & Record<string, unknown>;
				data: Profile;
		  } | null>)
		| undefined;
	/**
	 * Custom function to refresh a token
	 */
	refreshAccessToken?:
		| ((refreshToken: string) => Promise<OAuth2Tokens>)
		| undefined;
	/**
	 * Custom function to map the provider profile to a
	 * user.
	 */
	mapProfileToUser?: OAuthProfileMapper<Profile> | undefined;
	/**
	 * Disable implicit sign up for new users. When set to true for the provider,
	 * sign-in need to be called with with requestSignUp as true to create new users.
	 */
	disableImplicitSignUp?: boolean | undefined;
	/**
	 * Disable sign up for new users.
	 */
	disableSignUp?: boolean | undefined;
	/**
	 * The prompt to use for the authorization code request
	 */
	prompt?:
		| (
				| "select_account"
				| "consent"
				| "login"
				| "none"
				| "select_account consent"
		  )
		| undefined;
	/**
	 * The response mode to use for the authorization code request
	 */
	responseMode?: ("query" | "form_post") | undefined;
	/**
	 * If enabled, the user info will be overridden with the provider user info
	 * This is useful if you want to use the provider user info to update the user info
	 *
	 * @default false
	 */
	overrideUserInfoOnSignIn?: boolean | undefined;
	/**
	 * Require this provider's email to be verified before a session is created.
	 *
	 * When the provider reports the email as unverified, the user and account are
	 * still created/linked, but no session is issued: the OAuth callback redirects
	 * with `?error=email_not_verified` and id-token sign-in returns a `403`
	 * `EMAIL_NOT_VERIFIED`. A verification email is (re)sent per the
	 * `emailVerification` settings (`sendOnSignUp` / `sendOnSignIn`).
	 *
	 * The gate checks the local user's verification state, not the provider's
	 * claim on each request: a user already verified through another method (or a
	 * prior verified sign-in) keeps access even if the provider later reports the
	 * email as unverified.
	 *
	 * This is opt-in per provider and is independent of
	 * `emailAndPassword.requireEmailVerification`; enabling that does not gate
	 * social sign-in. Only enable it for providers that report a trustworthy
	 * `email_verified` signal: several providers always report the email as
	 * unverified, which would block every sign-in.
	 *
	 * @default false
	 */
	requireEmailVerification?: boolean | undefined;
};
