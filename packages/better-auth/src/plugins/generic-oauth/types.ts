import type { User } from "@better-auth/core/db";
import type {
	OAuth2Tokens,
	OAuth2UserInfo,
	TokenEndpointAuth,
} from "@better-auth/core/oauth2";

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
	 * URL to fetch OAuth 2.0 configuration.
	 * If provided, the authorization and token endpoints will be fetched from this URL.
	 */
	discoveryUrl?: string | undefined;
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
	 * @returns A promise that resolves to a User object or null
	 */
	getUserInfo?:
		| ((tokens: OAuth2Tokens) => Promise<OAuth2UserInfo | null>)
		| undefined;
	/**
	 * Custom function to map the provider's user profile to your app's user fields.
	 * The profile contains standard OAuth2 fields plus any provider-specific extras.
	 */
	mapProfileToUser?:
		| ((
				profile: OAuth2UserInfo & Record<string, unknown>,
		  ) => Partial<User> | Promise<Partial<User>>)
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
}
