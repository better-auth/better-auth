import type { JWSAlgorithms } from "../plugins/jwt";

/**
 * Supported grant types of the token endpoint
 */
export type GrantType =
	| "authorization_code"
	// | "implicit" // NEVER SUPPORT - depreciated in oAuth2.1
	// | "password" // NEVER SUPPORT - depreciated in oAuth2.1
	| "client_credentials"
	| "refresh_token";
// | "urn:ietf:params:oauth:grant-type:device_code"  // specified in oAuth2.1 but not yet implemented
// | "urn:ietf:params:oauth:grant-type:jwt-bearer"   // unspecified in oAuth2.1
// | "urn:ietf:params:oauth:grant-type:saml2-bearer" // unspecified in oAuth2.1

/**
 * Metadata for authentication servers.
 *
 * @see https://datatracker.ietf.org/doc/html/rfc8414#section-2
 */
export interface AuthServerMetadata {
	/**
	 * The issuer identifier, this is the URL of the provider and can be used to verify
	 * the `iss` claim in the ID token.
	 *
	 * default: the value set for the issuer in the jwt plugin,
	 * otherwise the base URL of the auth server (e.g. `https://example.com`)
	 */
	issuer: string;
	/**
	 * The URL of the authorization endpoint.
	 *
	 * @default `/oauth2/authorize`
	 */
	authorization_endpoint: string;
	/**
	 * The URL of the token endpoint.
	 *
	 * @default `/oauth2/token`
	 */
	token_endpoint: string;
	/**
	 * The URL of the jwks_uri endpoint.
	 *
	 * For JWKS to work, you must install the `jwt` plugin.
	 *
	 * This value is automatically set to `/jwks` if the `jwt` plugin is installed.
	 *
	 * @default `/jwks`
	 */
	jwks_uri: string;
	/**
	 * The URL of the dynamic client registration endpoint.
	 *
	 * @default `/oauth2/register`
	 */
	registration_endpoint: string;
	/**
	 * Supported scopes.
	 */
	scopes_supported?: string[];
	/**
	 * Supported response types. (for /authorize endpoint)
	 */
	response_types_supported: "code"[];
	/**
	 * Supported response modes.
	 *
	 * `query`: the authorization code is returned in the query string
	 */
	response_modes_supported: "query"[];
	/**
	 * Supported grant types.
	 */
	grant_types_supported: GrantType[];
	/**
	 * Supported token endpoint authentication methods.
	 *
	 * only `client_secret_basic` and `client_secret_post` are supported.
	 *
	 * @default
	 * ["client_secret_basic", "client_secret_post"]
	 */
	token_endpoint_auth_methods_supported: (
		| "client_secret_basic"
		| "client_secret_post"
	)[];
	/**
	 * Algorithms supported for access tokens.
	 *
	 * Automatically uses the same algorithm used in the JWK Plugin.
	 *
	 * @default
	 * ["EdDSA"]
	 */
	token_endpoint_auth_signing_alg_values_supported: JWSAlgorithms[];
	/**
	 * URL of a page containing human-readable information
	 * that developers might want or need to know when using the
	 * authorization server
	 */
	service_documentation?: string;
	/**
	 * Languages and scripts supported for the user interface,
	 * represented as an array of language tag values from BCP 47
	 * [RFC5646](https://datatracker.ietf.org/doc/html/rfc5646)
	 */
	ui_locales_supported?: string[];
	/**
	 * URL that the authorization server provides to the
	 * person registering the client to read about the authorization
	 * server's requirements on how the client can use the data provided
	 * by the authorization server.
	 */
	op_policy_uri?: string;
	/**
	 * URL that the authorization server provides to the
	 * person registering the client to read about the authorization
	 * server's terms of service.
	 */
	op_tos_uri?: string;
	/**
	 * URL of the authorization server's OAuth 2.0 revocation
	 * endpoint [RFC7009](https://datatracker.ietf.org/doc/html/rfc7009)
	 */
	revocation_endpoint?: string;
	/**
	 * Array containing a list of client authentication
	 * methods supported by this revocation endpoint
	 *
	 * @default ["client_secret_basic"]
	 */
	revocation_endpoint_auth_methods_supported?: (
		| "none"
		| "client_secret_basic"
		| "client_secret_post"
	)[];
	/**
	 * Array containing a list of the JWS signing
	 * algorithms ("alg" values) supported by the revocation endpoint for
	 * the signature on the JWT.
	 */
	revocation_endpoint_auth_signing_alg_values_supported?: JWSAlgorithms;
	/**
	 * URL of the authorization server's OAuth 2.0
	 * introspection endpoint [RFC7662](https://datatracker.ietf.org/doc/html/rfc7662)
	 */
	introspection_endpoint?: string;
	/**
	 * Array containing a list of client authentication
	 * methods supported by this introspection endpoint
	 *
	 * @see https://www.iana.org/assignments/oauth-parameters/oauth-parameters.xhtml#token-types
	 */
	introspection_endpoint_auth_methods_supported?: "Bearer"[];
	/**
	 * Array containing a list of the JWS signing
	 * algorithms ("alg" values) supported by the introspection endpoint
	 */
	introspection_endpoint_auth_signing_alg_values_supported?: JWSAlgorithms;
	/**
	 * Supported code challenge methods.
	 *
	 * @default ["s256"]
	 */
	code_challenge_methods_supported: "s256"[];
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
	subject_types_supported: "public"[];
	/**
	 * Supported ID token signing algorithms.
	 *
	 * Automatically uses the same algorithm used in the JWK Plugin.
	 * Support for symmetric algorithms is strictly prohibited
	 * to sharing key vulnerabilities!
	 *
	 * @default
	 * ["EdDSA"]
	 */
	id_token_signing_alg_values_supported: JWSAlgorithms[] | ["HS256"];
	/**
	 * Supported claims.
	 *
	 * @default
	 * ["sub", "iss", "aud", "exp", "nbf", "iat", "jti", "email", "email_verified", "name", "family_name", "given_name", "sid", "scope", "azp"]
	 */
	claims_supported: string[];
}

/**
 * OAuth 2.0 Dynamic Client Registration Schema
 *
 * Current spec is based on OAuth 2.0, but shall use
 * OAuth 2.1 restrictions.
 *
 * https://datatracker.ietf.org/doc/html/rfc7591#section-2
 */
export interface OAuthClient {
	client_id: string;
	client_secret?: string;
	client_secret_expires_at?: number;
	scope?: string;
	//---- Recommended client data ----//
	user_id?: string;
	client_id_issued_at?: number;
	//---- UI Metadata ----//
	client_name?: string;
	client_uri?: string;
	logo_uri?: string;
	contacts?: string[];
	tos_uri?: string;
	policy_uri?: string;
	//---- Jwks (only one can be used) ----//
	jwks?: string[];
	jwks_uri?: string;
	//---- User Software Identifiers ----//
	software_id?: string;
	software_version?: string;
	software_statement?: string;
	//---- Authentication Metadata ----//
	redirect_uris?: string[];
	token_endpoint_auth_method?:
		| "none"
		| "client_secret_basic"
		| "client_secret_post";
	grant_types?: GrantType[];
	response_types?: "code"[];
	// | "token" // NEVER SUPPORT - depreciated in oAuth2.1
	//---- RFC6749 Spec ----//
	public?: boolean;
	type?: "web" | "native" | "user-agent-based";
	//---- Not Part of RFC7591 Spec ----//
	disabled?: boolean;
	//---- All other metadata ----//
	[key: string]: any;
}
