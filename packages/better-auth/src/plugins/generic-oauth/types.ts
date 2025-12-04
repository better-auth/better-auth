import type { GenericEndpointContext } from "@better-auth/core";
import type { User } from "@better-auth/core/db";
import type { OAuth2Tokens, OAuth2UserInfo } from "@better-auth/core/oauth2";

export interface GenericOAuthOptions {
	/**
	 * Array of OAuth provider configurations.
	 */
	config: GenericOAuthConfig[];
}

/**
 * Configuration interface for generic OAuth providers.
 */
export interface GenericOAuthConfig {
	/** Unique identifier for the OAuth provider */
	providerId: string;
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
	prompt?: ("none" | "login" | "consent" | "select_account") | undefined;
	/**
	 * Whether to use PKCE (Proof Key for Code Exchange)
	 * @default false
	 */
	pkce?: boolean | undefined;
	/**
	 * Access type for the authorization request.
	 * Use "offline" to request a refresh token.
	 */
	accessType?: string | undefined;
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
	 * Custom function to map the user profile to a User object.
	 */
	mapProfileToUser?:
		| ((
				profile: Record<string, any>,
		  ) => Partial<Partial<User>> | Promise<Partial<User>>)
		| undefined;
	/**
	 * Additional search-params to add to the authorizationUrl.
	 * Warning: Search-params added here overwrite any default params.
	 */
	authorizationUrlParams?:
		| (
				| Record<string, string>
				| ((ctx: GenericEndpointContext) => Record<string, string>)
		  )
		| undefined;
	/**
	 * Additional search-params to add to the tokenUrl.
	 * Warning: Search-params added here overwrite any default params.
	 */
	tokenUrlParams?:
		| (
				| Record<string, string>
				| ((ctx: GenericEndpointContext) => Record<string, string>)
		  )
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
}
