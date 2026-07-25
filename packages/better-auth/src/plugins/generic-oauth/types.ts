import type { Awaitable } from "@better-auth/core";
import type {
	OAuth2Tokens,
	OAuth2UserInfo,
	OAuthAccountKeyContext,
	OAuthMappedUser,
	OAuthRefreshContext,
	TokenEndpointAuth,
} from "@better-auth/core/oauth2";

/** Raw profile returned by a Generic OAuth provider. */
export type GenericOAuthUserInfo = Omit<OAuth2UserInfo, "id"> & {
	id?: string | number | null | undefined;
	sub?: string | number | null | undefined;
	[key: string]: unknown;
};

export interface GenericOAuthOptions<ID extends string = string> {
	/**
	 * Array of OAuth provider configurations.
	 */
	config: GenericOAuthConfig<ID>[];
}

/**
 * Configuration interface for generic OAuth providers.
 */
export interface GenericOAuthConfig<ID extends string = string> {
	/** Unique identifier for the OAuth provider */
	providerId: ID;
	/**
	 * Human-readable display name for this provider.
	 * Defaults to `providerId` if not set.
	 */
	name?: string | undefined;
	/**
	 * Stable subject assigned by the provider.
	 *
	 * OpenID Connect discovery providers use the verified profile's `sub` field
	 * by default. Plain OAuth providers use `id`. Configure this resolver when
	 * the provider uses a different immutable identifier. Better Auth never
	 * switches between fields at runtime because that could change an account's
	 * identity. The resolver never receives the mapped local user, so profile
	 * mapping cannot redefine provider identity.
	 */
	accountSubject?:
		| ((
				context: OAuthAccountKeyContext<GenericOAuthUserInfo>,
		  ) => Awaitable<string | number>)
		| undefined;
	/**
	 * Stable issuer namespace paired with the provider account ID.
	 *
	 * Discovery providers use the discovered issuer by default. Set this for
	 * providers without discovery, provider aliases that share one identity
	 * namespace, or tenant-specific issuers derived from verified provider data.
	 * The resolver must not use unverified request input.
	 */
	accountIssuer?:
		| string
		| ((
				context: OAuthAccountKeyContext<GenericOAuthUserInfo>,
		  ) => Awaitable<string>)
		| undefined;
	/**
	 * URL to fetch OAuth 2.0 configuration.
	 * If provided, the authorization and token endpoints will be fetched from this URL.
	 */
	discoveryUrl?: string | undefined;
	/**
	 * Require discovery to provide the issuer and JWKS metadata needed to verify
	 * ID tokens before this provider is registered.
	 *
	 * Enable this when provider identity is derived from ID-token claims. This
	 * prevents an unavailable or incomplete discovery document from silently
	 * downgrading the provider to unverified token decoding.
	 *
	 * @default false
	 */
	requireIdTokenVerification?: boolean | undefined;
	/**
	 * URL for the authorization endpoint.
	 * Optional if using discoveryUrl.
	 */
	authorizationUrl?: string | undefined;
	/**
	 * URL for the token endpoint.
	 * Optional if using discoveryUrl.
	 */
	tokenUrl?: string | undefined;
	/**
	 * URL for the user info endpoint.
	 * Optional if using discoveryUrl.
	 */
	userInfoUrl?: string | undefined;
	/**
	 * URL for the OIDC RP-Initiated Logout endpoint.
	 * Optional if using discoveryUrl and the discovery document includes
	 * `end_session_endpoint`.
	 */
	endSessionEndpoint?: string | undefined;
	/**
	 * URL the provider should redirect back to after logout.
	 * This must also be registered with the provider as a post-logout redirect URI.
	 */
	postLogoutRedirectURI?: string | undefined;
	/**
	 * Disable automatic provider logout on `authClient.signOut()`.
	 * When set, sign out only clears the Better Auth session.
	 */
	disableProviderLogout?: boolean | undefined;
	/** OAuth client ID */
	clientId: string;
	/** OAuth client secret */
	clientSecret?: string | undefined;
	/**
	 * Token endpoint client authentication method.
	 *
	 * Use `private_key_jwt` for IdPs that authenticate clients with RFC 7523
	 * client assertions instead of a client secret. Secret-based methods require
	 * clientSecret.
	 */
	tokenEndpointAuth?: TokenEndpointAuth | undefined;
	/**
	 * Array of OAuth scopes to request.
	 * @default []
	 */
	scopes?: string[] | undefined;
	/**
	 * Custom redirect URI.
	 * If not provided, a default URI will be constructed.
	 */
	redirectURI?: string | undefined;
	/**
	 * OAuth response type.
	 * @default "code"
	 */
	responseType?: string | undefined;
	/**
	 * The response mode to use for the authorization code request.

	 */
	responseMode?: ("query" | "form_post") | undefined;
	/**
	 * Prompt parameter for the authorization request.
	 * Controls the authentication experience for the user.
	 */
	prompt?:
		| (
				| "none"
				| "login"
				| "create"
				| "consent"
				| "select_account"
				| "select_account consent"
				| "login consent"
		  )
		| undefined;
	/**
	 * Whether to use PKCE (Proof Key for Code Exchange).
	 * Required by OAuth 2.1 for all authorization code flows.
	 * Disable only for providers that explicitly reject PKCE.
	 * @default true
	 */
	pkce?: boolean | undefined;
	/**
	 * Access type for the authorization request.
	 * Use "offline" to request a refresh token.
	 */
	accessType?: string | undefined;
	/**
	 * Fallback access-token lifetime, in seconds, used only when the provider's
	 * token response omits `expires_in`. Set this so `getAccessToken` can track
	 * expiry and refresh the token; leave unset if the provider returns
	 * `expires_in`.
	 */
	accessTokenExpiresIn?: number | undefined;
	/**
	 * Custom function to exchange authorization code for tokens.
	 * If provided, this function will be used instead of the default token exchange logic.
	 * This is useful for providers with non-standard token endpoints.
	 * @param data - Authorization code exchange parameters
	 * @returns A promise that resolves to OAuth2Tokens
	 */
	getToken?:
		| ((data: {
				code: string;
				redirectURI: string;
				codeVerifier?: string | undefined;
				deviceId?: string | undefined;
		  }) => Promise<OAuth2Tokens>)
		| undefined;
	/**
	 * Custom function to fetch user info.
	 * If provided, this function will be used instead of the default user info fetching logic.
	 * @param tokens - The OAuth tokens received after successful authentication
	 * @returns A promise that resolves to a raw provider profile or null
	 */
	getUserInfo?:
		| ((tokens: OAuth2Tokens) => Promise<GenericOAuthUserInfo | null>)
		| undefined;
	/**
	 * Custom function to map the provider's user profile to your app's user fields.
	 * The profile contains standard OAuth2 fields plus any provider-specific extras.
	 */
	mapProfileToUser?:
		| ((
				profile: GenericOAuthUserInfo,
		  ) => OAuthMappedUser | Promise<OAuthMappedUser>)
		| undefined;
	/**
	 * Additional search-params to add to the authorizationUrl.
	 * Warning: Search-params added here overwrite any default params.
	 */
	authorizationUrlParams?: Record<string, string> | undefined;
	/**
	 * Additional search-params to add to the tokenUrl.
	 * Parameters already set by Better Auth are preserved. Configure token
	 * endpoint client authentication with clientId, clientSecret, and
	 * tokenEndpointAuth.
	 */
	tokenUrlParams?: Record<string, string> | undefined;
	/**
	 * Additional body params merged into the token endpoint request when
	 * refreshing an access token. Useful for multi-tenant OIDC providers that
	 * need to change `scope`, `audience`, `resource`, or a tenant identifier on
	 * the refresh call — e.g. Zitadel's `urn:zitadel:iam:org:id:{orgId}` scope
	 * on workspace switch or Auth0 `audience` rotation — without forcing a new
	 * authorization redirect.
	 *
	 * The function form is invoked at refresh time and receives request
	 * metadata for the triggering request, so dynamic
	 * per-request values like an active organization id read from cookies or
	 * headers can be injected directly. Headers and cookies are
	 * attacker-controlled: callers MUST validate any value derived from them
	 * against the authenticated user's entitlements before forwarding it as a
	 * `scope`, `audience`, or tenant claim. Resolved values are merged into the
	 * form body; `grant_type` and `refresh_token` are protected from override,
	 * and `client_id` is set by the configured token-endpoint authentication
	 * after the merge so it cannot be overridden here.
	 */
	refreshTokenParams?:
		| Record<string, string>
		| ((
				ctx?: OAuthRefreshContext,
		  ) => Awaitable<Record<string, string> | undefined>)
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
	 * Authentication method for token requests.
	 * "basic" requires clientSecret.
	 * @default "post"
	 */
	authentication?: ("basic" | "post") | undefined;
	/**
	 * Custom headers to include in the discovery request.
	 * Useful for providers like Epic that require specific headers (e.g., Epic-Client-ID).
	 */
	discoveryHeaders?: Record<string, string> | undefined;
	/**
	 * Custom headers to include in the authorization request.
	 * Useful for providers like Qonto that require specific headers (e.g., X-Qonto-Staging-Token for local development).
	 */
	authorizationHeaders?: Record<string, string> | undefined;
	/**
	 * Override user info with the provider info.
	 *
	 * This will update the user info with the provider info,
	 * when the user signs in with the provider.
	 * @default false
	 */
	overrideUserInfo?: boolean | undefined;
	/**
	 * Require this provider's email to be verified before a session is created.
	 *
	 * When the provider reports the email as unverified, the user and account are
	 * still created or linked, but no session is issued: the callback redirects
	 * with `?error=email_not_verified`. The gate checks the local user's
	 * verification state, so a user already verified through another method keeps
	 * access. Only enable it for providers that report a trustworthy
	 * `email_verified` signal.
	 *
	 * @default false
	 */
	requireEmailVerification?: boolean | undefined;
	/**
	 * Accept callbacks from providers that initiate the OAuth flow without
	 * sending a `state` parameter (e.g. Clever). When enabled, stateless
	 * callbacks restart the OAuth flow server-side with a fresh `state` and
	 * PKCE verifier. See the generic-oauth docs for details.
	 *
	 * @default false
	 */
	allowIdpInitiated?: boolean | undefined;
	/**
	 * Disable OIDC `nonce` binding for this provider's `id_token`.
	 *
	 * Providers configured with `discoveryUrl` that publish a JWKS bind the
	 * `id_token` to the authorization request by default: Better Auth sends a
	 * server-generated `nonce` and rejects a callback whose `id_token` does not
	 * echo it (OIDC Core 1.0 §3.1.3.7). Set this to `true` only for OIDC
	 * providers that do not return the `nonce` claim in the authorization-code
	 * flow; doing so removes `id_token` replay protection for this provider.
	 *
	 * @default false
	 */
	disableIdTokenNonceBinding?: boolean | undefined;
}
