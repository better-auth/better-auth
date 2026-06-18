import type { JWTVerifyGetKey } from "jose";
import type { Awaitable, LiteralString } from "../types";

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
			verify: (token: string, nonce?: string) => Promise<boolean>;
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

export type OAuth2UserInfo = {
	id: string | number;
	name?: string | undefined;
	email?: (string | null) | undefined;
	image?: string | undefined;
	emailVerified: boolean;
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

/**
 * The result of building a provider authorization URL.
 *
 * `requestedScopes` is the effective set of scopes encoded in the URL (the
 * provider's built-in defaults + configured `options.scope` + per-request
 * `scopes`, composed by `resolveRequestedScopes`). Callers persist it so the
 * callback can fall back to the request when the provider omits `scope` from
 * its token response (RFC 6749 §5.1).
 */
export interface AuthorizationURLResult {
	url: URL;
	requestedScopes: string[];
}

/**
 * How much an RP trusts a provider's echoed token-response `scope` when
 * persisting `account.grantedScopes`.
 *
 * - `"full-grant"`: the echo is the user's complete current grant, so the seam
 *   replaces the stored grant with it. This is the only path that may narrow
 *   the grant. Declare it only for providers whose token response reports the
 *   full combined grant, e.g. Google with `include_granted_scopes`.
 * - `"projection"`: the echo is this request's subset, so the seam unions it
 *   onto the stored grant. The safe default for every provider.
 * - `"absent-echo"`: the provider omitted `scope`, so the grant equals what was
 *   requested (RFC 6749 §5.1) and the seam unions the requested set. Resolved
 *   at runtime by the persistence seam, never declared by a provider.
 *
 * @see https://www.rfc-editor.org/rfc/rfc6749#section-5.1
 */
export type GrantAuthority = "full-grant" | "projection" | "absent-echo";

/**
 * The authority a provider may declare for its own echoed scope. `"absent-echo"`
 * is excluded because it is a runtime condition (an omitted echo), not a
 * provider trait.
 */
export type ProviderGrantAuthority = Exclude<GrantAuthority, "absent-echo">;

export interface UpstreamProvider<
	T extends Record<string, any> = Record<string, any>,
	O extends Record<string, any> = Partial<ProviderOptions>,
> {
	id: LiteralString;
	/**
	 * The path the provider redirects back to, relative to the app base URL,
	 * e.g. `/callback/google`.
	 */
	callbackPath: string;
	/**
	 * How the persistence seam treats this provider's echoed token-response
	 * `scope`. Declare `"full-grant"` only when the echo is the user's complete
	 * current grant (e.g. Google with `include_granted_scopes`); otherwise the
	 * echo is unioned onto the stored grant.
	 *
	 * @default "projection"
	 */
	grantAuthority?: ProviderGrantAuthority | undefined;
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
	}) => Awaitable<AuthorizationURLResult>;
	name: string;
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
	createEndSessionURL?:
		| ((data: {
				idToken?: string | null | undefined;
				postLogoutRedirectURI?: string | undefined;
				state?: string | undefined;
		  }) => Awaitable<URL | null>)
		| undefined;
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

export type ProviderOptions<Profile extends Record<string, any> = any> = {
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
	 * verifyIdToken function to verify the id token
	 */
	verifyIdToken?:
		| ((token: string, nonce?: string) => Promise<boolean>)
		| undefined;
	/**
	 * Custom function to get user info from the provider
	 */
	getUserInfo?:
		| ((token: OAuth2Tokens) => Promise<{
				user: {
					id: string;
					name?: string;
					email?: string | null;
					image?: string;
					emailVerified: boolean;
					[key: string]: any;
				};
				// TODO: type as `Profile` once provider getUserInfo paths that return a
				// narrower data shape than their declared profile are reconciled; today
				// `any` is load-bearing for those (e.g. facebook) and tightening it ripples
				// across ~10 providers, out of scope for the grant refactor.
				data: any;
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
	mapProfileToUser?:
		| ((profile: Profile) =>
				| {
						id?: string;
						name?: string;
						email?: string | null;
						image?: string;
						emailVerified?: boolean;
						[key: string]: any;
				  }
				| Promise<{
						id?: string;
						name?: string;
						email?: string | null;
						image?: string;
						emailVerified?: boolean;
						[key: string]: any;
				  }>)
		| undefined;
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
