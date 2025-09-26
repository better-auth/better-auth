import type { OAuth2Tokens, OAuth2UserInfo } from "../../oauth2";
import type { InferOptionSchema, User } from "../../types";
import type { oauthRegistrationSchema } from "./schema";

/**
 * Configuration interface for generic OAuth providers.
 */
interface GenericOAuthConfigBase {
	/** Unique identifier for the OAuth provider */
	providerId: string;
	/**
	 * URL to fetch OAuth 2.0 configuration.
	 * If provided, the authorization and token endpoints will be fetched from this URL.
	 */
	discoveryUrl?: string;
	/**
	 * URL for the authorization endpoint.
	 * Optional if using discoveryUrl.
	 */
	authorizationUrl?: string;
	/**
	 * URL for the token endpoint.
	 * Optional if using discoveryUrl.
	 */
	tokenUrl?: string;
	/**
	 * URL for the user info endpoint.
	 * Optional if using discoveryUrl.
	 */
	userInfoUrl?: string;
	/**
	 * Array of OAuth scopes to request.
	 * @default []
	 */
	scopes?: string[];
	/**
	 * Custom redirect URI.
	 * If not provided, a default URI will be constructed.
	 */
	redirectURI?: string;
	/**
	 * OAuth response type.
	 * @default "code"
	 */
	responseType?: string;
	/**
	 * The response mode to use for the authorization code request.

	 */
	responseMode?: "query" | "form_post";
	/**
	 * Prompt parameter for the authorization request.
	 * Controls the authentication experience for the user.
	 */
	prompt?: "none" | "login" | "consent" | "select_account";
	/**
	 * Whether to use PKCE (Proof Key for Code Exchange)
	 * @default false
	 */
	pkce?: boolean;
	/**
	 * Access type for the authorization request.
	 * Use "offline" to request a refresh token.
	 */
	accessType?: string;
	/**
	 * Custom function to fetch user info.
	 * If provided, this function will be used instead of the default user info fetching logic.
	 * @param tokens - The OAuth tokens received after successful authentication
	 * @returns A promise that resolves to a User object or null
	 */
	getUserInfo?: (tokens: OAuth2Tokens) => Promise<OAuth2UserInfo | null>;
	/**
	 * Custom function to map the user profile to a User object.
	 */
	mapProfileToUser?: (
		profile: Record<string, any>,
	) => Partial<Partial<User>> | Promise<Partial<User>>;
	/**
	 * Additional search-params to add to the authorizationUrl.
	 * Warning: Search-params added here overwrite any default params.
	 */
	authorizationUrlParams?: Record<string, string>;

	/**
	 * Additional search-params to add to the tokenUrl.
	 * Warning: Search-params added here overwrite any default params.
	 */
	tokenUrlParams?: Record<string, string>;
	/**
	 * Disable implicit sign up for new users. When set to true for the provider,
	 * sign-in need to be called with with requestSignUp as true to create new users.
	 */
	disableImplicitSignUp?: boolean;
	/**
	 * Disable sign up for new users.
	 */
	disableSignUp?: boolean;
	/**
	 * Authentication method for token requests.
	 * @default "post"
	 */
	authentication?: "basic" | "post";
	/**
	 * Custom headers to include in the discovery request.
	 * Useful for providers like Epic that require specific headers (e.g., Epic-Client-ID).
	 */
	discoveryHeaders?: Record<string, string>;
	/**
	 * Custom headers to include in the authorization request.
	 * Useful for providers like Qonto that require specific headers (e.g., X-Qonto-Staging-Token for local development).
	 */
	authorizationHeaders?: Record<string, string>;
	/**
	 * Override user info with the provider info.
	 *
	 * This will update the user info with the provider info,
	 * when the user signs in with the provider.
	 * @default false
	 */
	overrideUserInfo?: boolean;
}

/**
 * The Generic OAuth config plus dynamic registration configurations.
 */
interface GenericOAuthConfigWithDR extends GenericOAuthConfigBase {
	/**
	 * With dynamic registration, the client will automatically register with a provided
	 * `registration_endpoint` and collect the `client_id` and `client_secret`.
	 */
	dynamicRegistration: {
		/**
		 * The registration endpoint to use for dynamic registration.
		 */
		registrationEndpoint: string;
		/**
		 * The name you want to register the client with.
		 */
		clientName: string;
		/**
		 * A URL which represents the client.
		 */
		clientUri?: string;
	};
}

/**
 * The Generic OAuth config without dynamic registration configurations, just normal `clientId` & `clientSecret`.
 */
interface GenericOAuthConfigWithoutDR extends GenericOAuthConfigBase {
	/** OAuth client ID */
	clientId: string;
	/** OAuth client secret */
	clientSecret?: string;
}

export type GenericOAuthConfig =
	| GenericOAuthConfigWithDR
	| GenericOAuthConfigWithoutDR;

export interface GenericOAuthOptions {
	/**
	 * Array of OAuth provider configurations.
	 */
	config: GenericOAuthConfig[];
	schema?: InferOptionSchema<typeof oauthRegistrationSchema>;
}
