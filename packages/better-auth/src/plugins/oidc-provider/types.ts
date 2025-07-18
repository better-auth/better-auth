import { Awaitable } from "vitest";
import type { Session, User } from "../../types";
import { AuthServerMetadata, GrantType } from "../mcp/types";

export interface OIDCOptions {
	/**
	 * schema for the oidc plugin
	 */
	schema?: {
		oauthClient?: {
			/** @default "oauthClient" */
			modelName?: string
		}
		oauthConsent?: {
			/** @default "oauthConsent" */
			modelName?: string
		}
	}
	/**
	 * Authorized clients
	 */
	authorizedClients?: string[];
	/**
	 * The amount of time in seconds that the access token is valid for.
	 * 10 min is recommended by the OIDC spec (https://openid.net/specs/oauth-v2-jarm.html#section-2.1-2.3.1)
	 *
	 * @default 600 (10 min)
	 */
	accessTokenExpiresIn?: number;
	/**
	 * The amount of time in seconds that a client
	 * credentials grant access token is valid for.
	 *
	 * @default 3600 (1 hour)
	 */
	m2mAccessTokenExpiresIn?: number;
	/**
	 * The amount of time in seconds that id token is valid for.
	 * 
	 * @default 36000 (10 hours) - Recommended by the OIDC spec
	 */
	idTokenExpiresIn?: number;
	/**
	 * The amount of time in seconds that the refresh token is valid for.
	 * Typical industry standard is 30 days
	 *
	 * @default 2592000 (30 days) 
	 */
	refreshTokenExpiresIn?: number;
	/**
	 * The amount of time in seconds that the authorization code is valid for.
	 *
	 * @default 600 (10 minutes) - Recommended by the OIDC spec
	 */
	codeExpiresIn?: number;
	/**
	 * Allow dynamic client registration.
	 * 
	 * @default false
	 */
	allowUnauthenticatedClientRegistration?: boolean;
	/**
	 * Allow dynamic client registration.
	 * 
	 * @default false
	 */
	allowDynamicClientRegistration?: boolean;
	/**
	 * List of scopes for newly registered clients
	 * if not requested.
	 * 
	 * @default undefined
	 */
	clientRegistrationDefaultScopes?: string[];
	/**
	 * List of scopes for allowed clients in addition to
	 * those listed in the default scope. Finalized allowed list is
	 * the union of the default scopes and this list.
	 *
	 * If both clientRegistrationDefaultScopes and this
	 * are undefined, only scopes listed in the scopes option
	 * are allowed.
	 * 
	 * @default - clientRegistrationDefaultScopes
	 */
	clientRegistrationAllowedScopes?: string[];
	/**
	 * List of scopes a newly registered client can have.
	 *
	 * Leave undefined to throw error if no scope was sent
	 * 
	 * @default undefined
	 */
	clientCredentialGrantDefaultScopes?: string[];
	/**
	 * The scopes that the client is allowed to request.
	 * Must contain "openid" to be considered an OIDC server,
	 * otherwise it is just an OAuth server.
	 * 
	 * @see https://openid.net/specs/openid-connect-core-1_0.html#ScopeClaims
	 * @default
	 * ```ts
	 * ["openid", "profile", "email", "offline_access"]
	 * ```
	 */
	scopes?: string[];
	/**
	 * The URL to the login page. This is used if the client requests the `login`
	 * prompt.
	 */
	loginPage: string;
	/**
	 * A URL to the consent page where the user will be redirected if the client
	 * requests consent.
	 *
	 * After the user consents, they should be redirected by the client to the
	 * `redirect_uri` with the authorization code.
	 *
	 * When the server redirects the user to the consent page, it will include the
	 * following query parameters:
	 *
	 * - `client_id` - The ID of the client.
	 * - `scope` - The requested scopes.
	 * - `code` - The authorization code.
	 *
	 * once the user consents, you need to call the `/oauth2/consent` endpoint
	 * with the code and `accept: true` to complete the authorization. Which will
	 * then return the client to the `redirect_uri` with the authorization code.
	 *
	 * @example
	 * ```ts
	 * consentPage: "/oauth/authorize"
	 * ```
	 */
	consentPage: string;
	/**
	 * Custom function to generate a client ID.
	 */
	generateClientId?: () => string;
	/**
	 * Custom function to generate a client secret.
	 */
	generateClientSecret?: () => string;
	/**
	 * Get the additional user info claims
	 *
	 * This applies only to the OIDC `userinfo` endpoint.
	 *
	 * @param user - The user object.
	 * @param scopes - The scopes that the client requested.
	 * @returns The user info claim.
	 */
	getAdditionalUserInfoClaim?: (
		user: User & Record<string, any>,
		scopes: string[],
	) => Awaitable<Record<string, any>>;
	/**
	 * List of all additional claims returned from
	 * customIdTokenClaims and customJwtClaims.
	 * 
	 * Must be defined when using 
	 * customIdTokenClaims or customJwtClaims
	 */
	customClaims?: string[];
	/**
	 * Custom claims attached to id tokens.
	 * To remain OIDC compliant, claims should be
	 * namespaced with a URI. For example, a site
	 * example.com should namespace roles at
	 * https://example.com/roles.
	 */
	customIdTokenClaims?: (
		user: User,
		scopes: string[],
	) => Awaitable<Record<string, any>>;
	/**
	 * Custom claims attached to access tokens.
	 */
	customJwtClaims?: (
		user: User,
		scopes: string[],
	) => Awaitable<Record<string, any>>;
	/**
	 * Overwrite specific /.well-known/openid-configuration
	 * values so they are not available publically.
	 * This may be important if not all clients need specific scopes.
	 *
	 * NOTE: this does not prevent the system from issuing
	 * these scopes and returning those claims (use scopes and customClaims instead).
	 */
	advertisedMetadata?: {
		/**
		 * Advertised scopes_supported located at /.well-known/openid-configuration
		 * 
		 * All values must be found in the scope field
		 */
		scopes_supported: string[];
		/**
		 * Advertised claims_supported located at /.well-known/openid-configuration
		 * 
		 * All values must be found in the customizedClaims field or
		 * be an internally supported claim.
		 * 
		 * Internally supported claims:
		 * ["sub", "iss", "aud", "exp", "nbf", "iat", "jti", "sid", "scope", "azp"]
		 */
		claims_supported: string[];
	}
	/**
	 * Custom session token formatter. You can
	 * choose to perform additional functionality such as
	 * refresh token encryption or store the raw token
	 * for session replay attacks.
	 *
	 * If defined, you must provide the function
	 * decodeRefreshToken.
	 */
	encodeRefreshToken?: (
		token: string,
		session?: Omit<Session, 'token'> & { token?: string },
	) => Awaitable<string>;
	/**
	 * Decodes a custom session token format.
	 * If you changed the format after production deployment,
	 * ensure that the prior version can still be decoded.
	 *
	 * Must be defined when using encodeRefreshToken.
	 * 
	 * @returns {string | undefined} sessionId - if returned,
	 * should be same as the one received in encodeRefreshToken.
	 * There is an added benefit that updates to the session occur
	 * via id instead of token.
	 * @returns {string} token - should be same as the one
	 * received in encodeRefreshToken
	 */
	decodeRefreshToken?: (
		token: string,
	) => Awaitable<{ sessionId?: string, token: string }>;
}

export interface AuthorizationQuery {
	/**
	 * The response type.
	 * Code is for authorization code flow.
	 * Token and id_token are for implicit flow.
	 */
	response_type: "code" | "token" | "id_token" | "token id_token";
	/**
	 * The redirect URI for the client. Must be one of the registered redirect URLs for the client.
	 */
	redirect_uri?: string;
	/**
	 * The scope of the request. Must be a space-separated list of case sensitive strings.
	 *
	 * - "openid" is required for all requests
	 * - "profile" is required for requests that require user profile information.
	 * - "email" is required for requests that require user email information.
	 * - "offline_access" is required for requests that require a refresh token.
	 */
	scope?: string;
	/**
	 * Opaque value used to maintain state between the request and the callback. Typically,
	 * Cross-Site Request Forgery (CSRF, XSRF) mitigation is done by cryptographically binding the
	 * value of this parameter with a browser cookie.
	 *
	 * Note: Better Auth stores the state in a database instead of a cookie. - This is to minimize
	 * the complication with native apps and other clients that may not have access to cookies.
	 */
	state: string;
	/**
	 * The client ID. Must be the ID of a registered client.
	 */
	client_id: string;
	/**
	 * The prompt parameter is used to specify the type of user interaction that is required.
	 * 
	 * undefined - redirects user to login only when not logged in, otherwise returns
	 * "none" - silent authentication where an error is returned, not redirected to login
	 * "consent" - always forces user to scope consent
	 * "login" - always forces user to login
	 * "select_account" - forces user to select an account even if they are already logged in
	 */
	prompt?: "none" | "consent" | "login" | "select_account";
	/**
	 * The display parameter is used to specify how the authorization server displays the
	 * authentication and consent user interface pages to the end user.
	 */
	display?: "page" | "popup" | "touch" | "wap";
	/**
	 * End-User's preferred languages and scripts for the user interface, represented as a
	 * space-separated list of BCP47 [RFC5646] language tag values, ordered by preference. For
	 * instance, the value "fr-CA fr en" represents a preference for French as spoken in Canada,
	 * then French (without a region designation), followed by English (without a region
	 * designation).
	 *
	 * Better Auth does not support this parameter yet. It'll not throw an error if it's provided,
	 *
	 * 🏗️ currently not implemented
	 */
	ui_locales?: string;
	/**
	 * The maximum authentication age.
	 *
	 * Specifies the allowable elapsed time in seconds since the last time the End-User was
	 * actively authenticated by the provider. If the elapsed time is greater than this value, the
	 * provider MUST attempt to actively re-authenticate the End-User.
	 *
	 * Note that max_age=0 is equivalent to prompt=login.
	 */
	max_age?: number;
	/**
	 * Requested Authentication Context Class Reference values.
	 *
	 * Space-separated string that
	 * specifies the acr values that the Authorization Server is being requested to use for
	 * processing this Authentication Request, with the values appearing in order of preference.
	 * The Authentication Context Class satisfied by the authentication performed is returned as
	 * the acr Claim Value, as specified in Section 2. The acr Claim is requested as a Voluntary
	 * Claim by this parameter.
	 */
	acr_values?: string;
	/**
	 * Hint to the Authorization Server about the login identifier the End-User might use to log in
	 * (if necessary). This hint can be used by an RP if it first asks the End-User for their
	 * e-mail address (or other identifier) and then wants to pass that value as a hint to the
	 * discovered authorization service. It is RECOMMENDED that the hint value match the value used
	 * for discovery. This value MAY also be a phone number in the format specified for the
	 * phone_number Claim. The use of this parameter is left to the OP's discretion.
	 */
	login_hint?: string;
	/**
	 * ID Token previously issued by the Authorization Server being passed as a hint about the
	 * End-User's current or past authenticated session with the Client.
	 *
	 * 🏗️ currently not implemented
	 */
	id_token_hint?: string;
	/**
	 * Code challenge
	 */
	code_challenge?: string;
	/**
	 * Code challenge method used
	 */
	code_challenge_method?: "s256";
	/**
	 * String value used to associate a Client session with an ID Token, and to mitigate replay
	 * attacks. The value is passed through unmodified from the Authentication Request to the ID Token.
	 * If present in the ID Token, Clients MUST verify that the nonce Claim Value is equal to the
	 * value of the nonce parameter sent in the Authentication Request. If present in the
	 * Authentication Request, Authorization Servers MUST include a nonce Claim in the ID Token
	 * with the Claim Value being the nonce value sent in the Authentication Request.
	 */
	nonce?: string;
}

/**
 * Stored within the verification.value field
 * in JSON format.
 * 
 * It is stored in JSON to prevent
 * direct searches by field on the db
 */
export interface VerificationValue {
	clientId?: string
	userId?: string
	requireConsent?: boolean
	redirectUri?: string
	scopes?: string
	state?: string
	codeChallenge?: string
	codeChallengeMethod?: 's256'
	nonce?: string
}

export interface TokenBody {
	/**
	 * The grant type. Must be 'authorization_code' or 'refresh_token'.
	 */
	grant_type: GrantType;
	/**
	 * The authorization code received from the authorization server.
	 */
	code?: string;
	/**
	 * The redirect URI of the client.
	 */
	redirect_uri?: string;
	/**
	 * The client ID.
	 */
	client_id?: string;
	/**
	 * The client secret.
	 */
	client_secret?: string;
	/**
	 * The refresh token received from the authorization server.
	 */
	refresh_token?: string;
}

/**
 * Metadata returned by the openid-configuration endpoint:
 * /.well-known/openid-configuration
 * 
 * NOTE: Url structure is different by appending to the end
 * of the url instead of the base.
 * 
 * @see https://datatracker.ietf.org/doc/html/rfc8414#section-5
 */
export interface OIDCMetadata extends AuthServerMetadata {
	/**
	 * The URL of the userinfo endpoint.
	 *
	 * @default `/oauth2/userinfo`
	 */
	userinfo_endpoint: string;
	/**
	 * acr_values supported.
	 *
	 * - `urn:mace:incommon:iap:silver`: Silver level of assurance
	 * - `urn:mace:incommon:iap:bronze`: Bronze level of assurance
	 *
	 * Determination of acr_value is considered bronze by default.
	 * Silver level determination coming soon.
	 *
	 * @default
	 * ["urn:mace:incommon:iap:bronze"]
	 * @see https://incommon.org/federation/attributes.html
	 */
	acr_values_supported: string[];
	/**
	 * Supported subject types.
	 *
	 * pairwise: the subject identifier is unique to the client
	 * public: the subject identifier is unique to the server
	 *
	 * only `public` is supported.
	 */
	subject_types_supported: ("public")[];
	/**
	 * Supported ID token signing algorithms.
	 *
	 * Automatically uses the same algorithm used in the JWK Plugin
	 *
	 * @default
	 * ["EdDSA"]
	 */
	id_token_signing_alg_values_supported: string[];
	/**
	 * Supported claims.
	 *
	 * @default
	 * ["sub", "iss", "aud", "exp", "nbf", "iat", "jti", "email", "email_verified", "name", "family_name", "given_name", "sid", "scope", "azp"]
	 */
	claims_supported: string[];
}

/**
 * Client registered values as stored on the database
 */
export interface SchemaClient {
	//---- Required ----//
	/**
	 * Client ID
	 *
	 * size 32
	 *
	 * as described on https://www.rfc-editor.org/rfc/rfc6749.html#section-2.2
	 */
  clientId: string
	/**
	 * Client Secret
	 *
	 * A secret for the client, if required by the authorization server.
	 *
	 * size 32
	 */
  clientSecret?: string
	/** Whether the client is disabled or not. */
	disabled?: boolean
	/**
	 * Restricts scopes allowed for the client.
	 * 
	 * If not defined, any scope can be requested.
	 */
  allowedScopes?: string[]
	//---- Recommended client data ----//
  userId?: string
	/** Created time */
  createdAt?: Date
	/** Last updated time */
  updatedAt?: Date
	/** Expires time */
  expiresAt?: Date
	//---- UI Metadata ----//
	/** The name of the client. */
  name?: string
	/** Linkable uri of the client. */
  uri?: string
	/** The icon of the client. */
  icon?: string
	/** List of contacts for the client. */
  contacts?: string[]
	/** Client Terms of Service Uri */
  tos?: string
	/** Client Privacy Policy Uri */
  policy?: string
	//---- User Software Identifiers ----//
  softwareId?: string
  softwareVersion?: string
  softwareStatement?: string
	//---- Authentication Metadata ----//
	/**
	 * List of registered redirect URLs. Must include the whole URL, including the protocol, port,
	 * and path.
	 *
	 * For example, `https://example.com/auth/callback`
	 */
  redirectUris?: string[]
  tokenEndpointAuthMethod?: (
    "none" |
    "client_secret_basic" |
    "client_secret_post"
  )
  grantTypes?: GrantType[]
  responseTypes?: ("code" | "token")[]
	//---- RFC6749 Spec ----//
	/**
	 * Indicates whether the client is public or confidential.
	 * If public, refreshing tokens doesn't require
	 * a client_secret. Clients are considered confidential by default.
	 *
	 * Uses `token_endpoint_auth_method` field or `type` field to determine
	 * 
	 * Described https://www.rfc-editor.org/rfc/rfc6749.html#section-2.1
	 * 
	 * @default undefined
	 */
	public?: boolean;
	/**
	 * The client type
	*
	* Described https://www.rfc-editor.org/rfc/rfc6749.html#section-2.1
	*
	* - web - A web application (confidential client)
	* - native - A mobile application (public client)
	* - user-agent-based - A user-agent-based application (public client)
	*/
  type?: "web" | "native" | "user-agent-based"
	//---- All other metadata ----//
	/**
	 * Additional metadata about the client.
	 */
  metadata?: string // in JSON format
}

/**
 * OAuth 2.0 Dynamic Client Registration Schema
 * https://datatracker.ietf.org/doc/html/rfc7591#section-2
 */
export interface OauthClient {
  client_id: string
  client_secret?: string
  client_secret_expires_at?: number
  scope?: string
  //---- Recommended client data ----//
  user_id?: string
  client_id_issued_at?: number
  //---- UI Metadata ----//
  client_name?: string
  client_uri?: string
  logo_uri?: string
  contacts?: string[]
  tos_uri?: string
  policy_uri?: string
  //---- Jwks (only one can be used) ----//
  jwks?: string[]
  jwks_uri?: string
  //---- User Software Identifiers ----//
  software_id?: string
  software_version?: string
  software_statement?: string
  //---- Authentication Metadata ----//
  redirect_uris?: string[]
  token_endpoint_auth_method?: (
    "none" |
    "client_secret_basic" |
    "client_secret_post"
  )
  grant_types?: GrantType[]
  response_types?: ("code" | "token")[]
	//---- RFC6749 Spec ----//
	public?: boolean;
	type?: "web" | "native" | "user-agent-based"
	//---- Not Part of RFC7591 Spec ----//
	disabled?: boolean
  //---- All other metadata ----//
  [key: string]: any
}
