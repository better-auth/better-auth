import { JWSAlgorithms } from "../jwt";

/**
 * Error that should return a 401 unauthenticated response.
 * The error.message should be the www-authenticate header value
 */
export class McpUnauthenticatedError extends Error {
	constructor(baseUrl: string, path?: string) {
		if (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);
		if (path?.length && !path.startsWith("/")) path = "/" + path;
		if (path && path.endsWith("/")) path = path.slice(0, -1);
		const wwwAuthenticateValue = `Bearer resource_metadata="${baseUrl}/.well-known/oauth-authorization-server${
			path ? path : ""
		}"`;
		super(wwwAuthenticateValue);
		this.name = "unauthenticated";
	}
}

/**
 * Supported grant types of the token endpoint
 */
export type GrantType =
	| "authorization_code"
	// | "implicit" // NEVER SUPPORT - depreciated in oAuth2.1
	// | "password" // NEVER SUPPORT - depreciated in oAuth2.1
	| "client_credentials"
	| "refresh_token";
// | "urn:ietf:params:oauth:grant-type:device_code" // specified in oAuth2.1 but yet implemented
// | "urn:ietf:params:oauth:grant-type:jwt-bearer" | // unspecified in oAuth2.1
// | "urn:ietf:params:oauth:grant-type:saml2-bearer" // unspecified in oAuth2.1

export interface MCPOptions {
	/**
	 * Metadata for the default resource server
	 * located at /.well-known/oauth-authorization-server.
	 *
	 * Also used as the default metadata in oAuthDiscoveryMetadata
	 * if not described at each endpoint.
	 *
	 * If defined here, this serves as the default setting
	 * if not manually described at each endpoint.
	 */
	resourceServer?: MCPResourceMetadata;
}

/**
 * Resource metadata server as defined by RFC 9728
 *
 * @see https://datatracker.ietf.org/doc/html/rfc9728#Terminology
 */
export interface MCPResourceMetadata {
	/**
	 * The protected resource's resource identifier,
	 * which is a URL that uses the https scheme and
	 * has no fragment component. It also SHOULD NOT
	 * include a query component, but it may if
	 * necessary.
	 *
	 * This SHOULD match the aud field of your JWT.
	 */
	resource: string;
	/**
	 * Each server should pertain to one issuer.
	 *
	 * MCP requires at least one server.
	 *
	 * @default [`${baseUrl}/.well-known/oauth-authorization-server`]
	 */
	authorization_servers?: string[];
	jwks_uri?: string;
	scopes_supported?: string[];
	bearer_methods_supported?: string[];
	resource_signing_alg_values_supported?: JWSAlgorithms[];
	resource_name?: string;
	resource_documentation?: string;
	resource_policy_uri?: string;
	resource_tos_uri?: string;
	tls_client_certificate_bound_access_tokens?: boolean;
	authorization_details_types_supported?: string;
	dpop_signing_alg_values_supported?: JWSAlgorithms;
	dpop_bound_access_tokens_required?: boolean;
}

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
