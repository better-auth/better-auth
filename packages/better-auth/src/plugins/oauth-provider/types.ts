import type { GrantType } from "../../oauth-2.1/types";
import type { InferOptionSchema, User } from "../../types";
import type { Awaitable } from "../../types/helper";
import { schema } from "./schema";

export type StoreTokenType =
	| "access_token"
	| "refresh_token"
	| "authorization_code";

export interface OAuthOptions {
	/**
	 * Custom schema definitions
	 */
	schema?: InferOptionSchema<typeof schema>;
	/**
	 * Trusted clients that are configured directly in the provider options.
	 * These clients bypass database lookups and can optionally skip consent screens.
	 */
	trustedClients?: SchemaClient[];
	/**
	 * The amount of time in seconds that the access token is valid for.
	 *
	 * @default 3600 (1 hour) - Industry standard
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
	 * Allow unauthenticated dynamic client registration.
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
	 * How long a dynamically created confidential client
	 * should last for.
	 *
	 * - If a `number` is passed as an argument it is used as the claim directly.
	 * - If a `Date` instance is passed as an argument it is converted to unix timestamp and used as the
	 *   claim.
	 * - If a `string` is passed as an argument it is resolved to a time span, and then added to the
	 *   current unix timestamp and used as the claim.
	 *
	 * Format used for time span should be a number followed by a unit, such as "5 minutes" or "1
	 * day".
	 *
	 * Valid units are: "sec", "secs", "second", "seconds", "s", "minute", "minutes", "min", "mins",
	 * "m", "hour", "hours", "hr", "hrs", "h", "day", "days", "d", "week", "weeks", "w", "year",
	 * "years", "yr", "yrs", and "y". It is not possible to specify months. 365.25 days is used as an
	 * alias for a year.
	 *
	 * If the string is suffixed with "ago", or prefixed with a "-", the resulting time span gets
	 * subtracted from the current unix timestamp. A "from now" suffix can also be used for
	 * readability when adding to the current unix timestamp.
	 *
	 * @default - undefined (does not expire)
	 */
	clientRegistrationClientSecretExpiration?: number | string | Date;
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
	 * Grant types supported by the token endpoint
	 *
	 * @default
	 * ["authorization_code", "client_credentials", "refresh_token"]
	 */
	grantTypes?: GrantType[];
	/**
	 * Create access token expirations based on scope.
	 *
	 * This is useful for higher-privelege scopes that
	 * require shorter expiration times. The earliest
	 * expiration will take precendence. If not specified,
	 * the default will take place.
	 *
	 * Note: values should be lower than the defaults
	 * `accessTokenExpiresIn` and `m2mAccessTokenExpiresIn`
	 *
	 * @example
	 * { "write:payments": "5m", "read:payments": "30m" }
	 */
	scopeExpirations?: Record<string, number | string | Date>;
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
	 * consentPage: "/consent"
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
	 * Store the client secret in your database in a secure way
	 * Note: This will not affect the client secret sent to the user, it will only affect the client secret stored in your database
	 *
	 * When disableJwtPlugin = false (recommended):
	 * - "hashed" - The client secret is hashed using the `hash` function.
	 * - { hash: (clientSecret: string) => Promise<string> } - A function that hashes the client secret.
	 *
	 * When disableJwtPlugin = true:
	 * - "encrypted" - The client secret is encrypted using the `encrypt` function.
	 * - { encrypt: (clientSecret: string) => Promise<string>, decrypt: (clientSecret: string) => Promise<string> } - A function that encrypts and decrypts the client secret.
	 *
	 * @default
	 * options.disableJwtPlugin ? "encrypted" : "hashed"
	 */
	storeClientSecret?:
		| "hashed"
		| "encrypted"
		| { hash: (clientSecret: string) => Promise<string> }
		| {
				encrypt: (clientSecret: string) => Promise<string>;
				decrypt: (clientSecret: string) => Promise<string>;
		  };
	/**
	 * Storage method of opaque access tokens and refresh tokens on your database.
	 *
	 * - "hashed" - The client secret is hashed using the `hash` function.
	 * - { hash: (token: string, type: StoreTokenType) => Promise<string> } - A function that hashes the token
	 *
	 * @default "hashed"
	 */
	storeTokens?:
		| "hashed"
		| { hash: (token: string, type: StoreTokenType) => Promise<string> };
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
		scopes_supported?: string[];
		/**
		 * Advertised claims_supported located at /.well-known/openid-configuration
		 *
		 * All values must be found in the customClaims field or
		 * be an internally supported claim.
		 *
		 * Internally supported claims:
		 * ["sub", "iss", "aud", "exp", "iat", "sid", "scope", "azp"]
		 */
		claims_supported?: string[];
	};
	/**
	 * Adds a prefix to an opaque access token.
	 * Note: the prefix is not stored in the database.
	 *
	 * Useful when also using the [API Key Plugin](../api-key/index.ts)
	 * or Secret Scanners (ie Github Secret Scanning, GitGuardian, Trufflehog).
	 *
	 * We recommend to append an underscore to make it more identifiable
	 * Additionally, we recommend you add the prefix prior to the first deployment
	 * otherwise you must utilize this with generateOpaqueAccessToken (storing the full
	 * encoded value on the database).
	 *
	 * @example "domain_at_"
	 * @default undefined
	 */
	opaqueAccessTokenPrefix?: string;
	/**
	 * Adds a prefix to an opaque refresh token.
	 * Note: the prefix is not stored in the database.
	 *
	 * Useful when using Secret Scanners (ie Github Secret Scanning,
	 * GitGuardian, Trufflehog).
	 *
	 * We recommend to append an underscore to make it more identifiable
	 * Additionally, we recommend you add the prefix prior to the first deployment
	 * otherwise you must utilize this with generateRefreshToken (storing the full
	 * encoded value on the database).
	 *
	 * @example "domain_rt_"
	 * @default undefined
	 */
	refreshTokenPrefix?: string;
	/**
	 * Adds a prefix to delivered client secrets.
	 * Note: the prefix is not stored in the database.
	 *
	 * Useful when using Secret Scanners (ie Github Secret Scanning,
	 * GitGuardian, Trufflehog).
	 *
	 * We recommend to append an underscore to make it more identifiable.
	 * Additionally, we recommend you add the prefix prior to the first deployment
	 * otherwise you must utilize this with generateClientSecret (storing the full
	 * encoded value on the database).
	 *
	 * @example "domain_cs_"
	 * @default undefined
	 */
	clientSecretPrefix?: string;
	/**
	 * Generate a unique access token to save on the database.
	 *
	 * @default
	 * generateRandomString(32, "A-Z", "a-z")
	 */
	generateOpaqueAccessToken?: () => Awaitable<string>;
	/**
	 * Generate a unique refresh token to save on the database.
	 *
	 * @default
	 * generateRandomString(32, "A-Z", "a-z")
	 */
	generateRefreshToken?: () => Awaitable<string>;
	/**
	 * Custom session token formatter. You can
	 * choose to perform additional functionality such as
	 * refresh token encryption or store the raw token
	 * for session replay attacks.
	 *
	 * If defined, you must provide the function
	 * decodeRefreshToken.
	 */
	encodeRefreshToken?: (token: string, sessionId?: string) => Awaitable<string>;
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
	) => Awaitable<{ sessionId?: string; token: string }>;
	/**
	 * Confirmations that individually silences specific well-known endpoint
	 * configuration warnings.
	 *
	 * Only set these specific values if you see the error as they
	 * are configuration specific.
	 */
	silenceWarnings?: {
		/**
		 * Config warning for `/.well-known/oauth-authorization-server/[issuer-path]`
		 *
		 * @default false
		 */
		oauthAuthServerConfig?: boolean;
		/**
		 * Config warning for `[issuer-path]/.well-known/openid-configuration`
		 *
		 * @default false
		 */
		openidConfig?: boolean;
	};
	/**
	 * By default, access and id tokens can be issued and verified
	 * through the JWT plugin.
	 *
	 * You can disable the JWT requirement in which access tokens
	 * will always be opaque and id tokens are always signed
	 * with HS256 using the client secret.
	 *
	 * @default false
	 */
	disableJwtPlugin?: boolean;
}

export interface OAuthAuthorizationQuery {
	/**
	 * The response type.
	 * - "code": authorization code flow.
	 */
	// NEVER SUPPORT "token" or "id_token" - depreciated in oAuth2.1
	response_type: "code";
	/**
	 * The redirect URI for the client. Must be one of the registered redirect URLs for the client.
	 */
	redirect_uri: string;
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
	code_challenge_method?: "S256";
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
	type: "authorization_code" | "consent";
	clientId: string;
	sessionId: string;
	userId: string;
	redirectUri?: string;
	scopes: string;
	state?: string;
	codeChallenge?: string;
	codeChallengeMethod?: "S256";
	nonce?: string;
}

/**
 * Client registered values as used within the plugin
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
	clientId: string;
	/**
	 * Client Secret
	 *
	 * A secret for the client, if required by the authorization server.
	 *
	 * size 32
	 */
	clientSecret?: string;
	/** Whether the client is disabled or not. */
	disabled?: boolean;
	/**
	 * Restricts scopes allowed for the client.
	 *
	 * If not defined, any scope can be requested.
	 */
	allowedScopes?: string[];
	//---- Recommended client data ----//
	userId?: string;
	/** Created time */
	createdAt?: Date;
	/** Last updated time */
	updatedAt?: Date;
	/** Expires time */
	expiresAt?: Date;
	//---- UI Metadata ----//
	/** The name of the client. */
	name?: string;
	/** Linkable uri of the client. */
	uri?: string;
	/** The icon of the client. */
	icon?: string;
	/** List of contacts for the client. */
	contacts?: string[];
	/** Client Terms of Service Uri */
	tos?: string;
	/** Client Privacy Policy Uri */
	policy?: string;
	//---- User Software Identifiers ----//
	softwareId?: string;
	softwareVersion?: string;
	softwareStatement?: string;
	//---- Authentication Metadata ----//
	/**
	 * List of registered redirect URLs. Must include the whole URL, including the protocol, port,
	 * and path.
	 *
	 * For example, `https://example.com/auth/callback`
	 */
	redirectUris?: string[];
	tokenEndpointAuthMethod?:
		| "none"
		| "client_secret_basic"
		| "client_secret_post";
	grantTypes?: GrantType[];
	responseTypes?: "code"[];
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
	type?: "web" | "native" | "user-agent-based";
	//---- All other metadata ----//
	/** Used to indicate if consent screen can be skipped */
	skipConsent?: boolean;
	/**
	 * Additional metadata about the client.
	 */
	metadata?: string; // in JSON format
}

export interface OAuthOpaqueAccessToken {
	/**
	 * The opaque access token.
	 */
	token: string;
	/**
	 * The client ID of the client that requested the access token.
	 */
	clientId: string;
	/**
	 * The session ID the access token is associated with.
	 *
	 * Not available in client credentials grant
	 * where no user session is involved.
	 */
	sessionId?: string;
	/**
	 * The user ID the access token is associated with.
	 *
	 * Not available in client credentials grant
	 * wher no user is involved.
	 */
	userId?: string;
	/**
	 * The refresh token the access token is associated with.
	 *
	 * Not available without the "offline_access" scope
	 */
	refreshId?: string;
	/** The expiration date of the access token. */
	expiresAt: Date;
	/** The creation date of the access token. */
	createdAt: Date;
	/**
	 * Scope granted for the access token.
	 *
	 * Shall match the refreshId.scopes if refreshId is provided.
	 */
	scopes: string[];
}

/**
 * Refresh Token Database Schema
 */
export interface OAuthRefreshToken {
	token: string;
	sessionId: string;
	userId: string;
	clientId?: string;
	expiresAt: Date;
	createdAt: Date;
	/**
	 * Scopes granted for this refresh token.
	 *
	 * Considered Immutable once granted.
	 */
	scopes?: string[];
}

/**
 * Consent Database Schema
 */
export interface OAuthConsent {
	clientId: string;
	userId: string;
	scopes: string[];
	consentGiven: boolean;
	createdAt: Date;
	updatedAt: Date;
}
