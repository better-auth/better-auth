import type { AssertionSigningAlgorithm } from "@better-auth/core/oauth2";
import type { JWSAlgorithms } from "better-auth/plugins";
import type { Prompt } from ".";

/**
 * Supported grant types of the token endpoint
 */
export type GrantType =
	| "authorization_code"
	// | "implicit" // NEVER SUPPORT - deprecated in oAuth2.1
	// | "password" // NEVER SUPPORT - deprecated in oAuth2.1
	| "client_credentials"
	| "refresh_token";
// | "urn:ietf:params:oauth:grant-type:device_code"  // specified in oAuth2.1 but not yet implemented
// | "urn:ietf:params:oauth:grant-type:jwt-bearer"   // unspecified in oAuth2.1
// | "urn:ietf:params:oauth:grant-type:saml2-bearer" // unspecified in oAuth2.1

export type AuthMethod =
	| "client_secret_basic" // Basic header
	| "client_secret_post" // POST
	| "private_key_jwt"; // JWT signed with client's private key (RFC 7523)
// | "client_secret_jwt" // must also add alg_values_supported for that endpoint
export type TokenEndpointAuthMethod = AuthMethod | "none"; // Public client support for the token auth endpoint
export type BearerMethodsSupported = "header" | "body";

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
	jwks_uri?: string;
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
	 * @default
	 * ["client_secret_basic", "client_secret_post"]
	 */
	token_endpoint_auth_methods_supported?: TokenEndpointAuthMethod[];
	/**
	 * Array containing a list of the JWS signing
	 * algorithms ("alg" values) supported by the token endpoint for
	 * the signature on the JWT used to authenticate the client at the
	 * token endpoint for the "private_key_jwt" and "client_secret_jwt"
	 * authentication methods (see field token_endpoint_auth_methods_supported).
	 */
	token_endpoint_auth_signing_alg_values_supported?: AssertionSigningAlgorithm[];
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
	 * @default
	 * ["client_secret_basic", "client_secret_post"]
	 */
	revocation_endpoint_auth_methods_supported?: AuthMethod[];
	/**
	 * Array containing a list of the JWS signing
	 * algorithms ("alg" values) supported by the revocation endpoint for
	 * the signature on the JWT used to authenticate the client at the
	 * token endpoint for the "private_key_jwt" and "client_secret_jwt"
	 * authentication methods (see field revocation_endpoint_auth_methods_supported).
	 */
	revocation_endpoint_auth_signing_alg_values_supported?: AssertionSigningAlgorithm[];
	/**
	 * URL of the authorization server's OAuth 2.0
	 * introspection endpoint [RFC7662](https://datatracker.ietf.org/doc/html/rfc7662)
	 */
	introspection_endpoint?: string;
	/**
	 * Array containing a list of client authentication
	 * methods supported by this introspection endpoint
	 *
	 * @default
	 * ["client_secret_basic", "client_secret_post"]
	 */
	introspection_endpoint_auth_methods_supported?: AuthMethod[];
	/**
	 * Array containing a list of the JWS signing
	 * algorithms ("alg" values) supported by the introspection endpoint
	 * used to authenticate the client at the token endpoint for
	 * the "private_key_jwt" and "client_secret_jwt" authentication methods
	 * (see field introspection_endpoint_auth_methods_supported).
	 */
	introspection_endpoint_auth_signing_alg_values_supported?: AssertionSigningAlgorithm[];
	/**
	 * Supported code challenge methods.
	 *
	 * @default ["S256"]
	 */
	code_challenge_methods_supported: "S256"[];
	/**
	 * Boolean value specifying whether the authorization server provides
	 * the iss parameter in the authorization response (RFC 9207)
	 *
	 * @see https://datatracker.ietf.org/doc/html/rfc9207
	 * @default true
	 */
	authorization_response_iss_parameter_supported?: boolean;
	/**
	 * Whether the authorization server supports discovering clients via
	 * [Client ID Metadata Documents](https://datatracker.ietf.org/doc/draft-ietf-oauth-client-id-metadata-document/)
	 * (an HTTPS URL as `client_id`).
	 *
	 * Set at runtime by the `@better-auth/cimd` plugin (or any other
	 * `ClientDiscovery` that contributes this field via
	 * {@link ClientDiscovery.discoveryMetadata}). oauth-provider never sets
	 * it on its own.
	 */
	client_id_metadata_document_supported?: boolean;
	/**
	 * Boolean value specifying whether the OP supports back-channel logout,
	 * with true indicating support.
	 *
	 * Registered in the "OAuth Authorization Server Metadata" IANA registry
	 * under OpenID Connect Back-Channel Logout 1.0, so this may appear at both
	 * `.well-known/oauth-authorization-server` and `.well-known/openid-configuration`.
	 *
	 * @default false
	 * @see https://openid.net/specs/openid-connect-backchannel-1_0.html#OPMetadata
	 */
	backchannel_logout_supported?: boolean;
	/**
	 * Boolean value specifying whether the OP can pass a `sid` (session ID)
	 * Claim in the Logout Token to identify the RP session with the OP.
	 *
	 * When true, the OP also includes `sid` in ID Tokens it issues.
	 *
	 * @default false
	 * @see https://openid.net/specs/openid-connect-backchannel-1_0.html#OPMetadata
	 */
	backchannel_logout_session_supported?: boolean;
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
	 * @see https://openid.net/specs/openid-connect-core-1_0.html#SubjectIDTypes
	 */
	subject_types_supported: ("public" | "pairwise")[];
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
	id_token_signing_alg_values_supported: JWSAlgorithms[];
	/**
	 * Supported claims.
	 *
	 * @default
	 * ["sub", "iss", "aud", "exp", "nbf", "iat", "jti", "email", "email_verified", "name", "family_name", "given_name", "sid", "scope", "azp"]
	 */
	claims_supported: string[];
	/**
	 * RP-Initiated Logout Endpoint
	 *
	 * @see https://openid.net/specs/openid-connect-rpinitiated-1_0.html
	 */
	end_session_endpoint: string;
	/**
	 * Prompt values supported by this OIDC server
	 *
	 * @see https://openid.net/specs/openid-connect-prompt-create-1_0.html#OpenID.Discovery
	 */
	prompt_values_supported: Prompt[];
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
	user_id?: string | null;
	client_id_issued_at?: number;
	//---- UI Metadata ----//
	client_name?: string;
	client_uri?: string;
	logo_uri?: string;
	contacts?: string[];
	tos_uri?: string;
	policy_uri?: string;
	//---- Jwks (only one can be used) ----//
	/** JWK Set — accepts either a bare key array or an RFC 7517 JWKS object `{"keys":[...]}` */
	jwks?: Record<string, unknown>[] | { keys: Record<string, unknown>[] };
	jwks_uri?: string;
	//---- User Software Identifiers ----//
	software_id?: string;
	software_version?: string;
	software_statement?: string;
	//---- Authentication Metadata ----//
	redirect_uris: string[];
	post_logout_redirect_uris?: string[];
	/**
	 * RP URL that the OP POSTs a signed Logout Token to when a session at the OP
	 * ends. The RP uses the token to terminate its own session state for that
	 * user (including any access tokens it has bound to the session).
	 *
	 * @see https://openid.net/specs/openid-connect-backchannel-1_0.html#RPMetadata
	 */
	backchannel_logout_uri?: string;
	/**
	 * When true, the RP requires the `sid` Claim in every Logout Token it
	 * receives; the OP will not dispatch user-scoped (sid-less) logouts to it.
	 *
	 * @default false
	 * @see https://openid.net/specs/openid-connect-backchannel-1_0.html#RPMetadata
	 */
	backchannel_logout_session_required?: boolean;
	token_endpoint_auth_method?:
		| "none"
		| "client_secret_basic"
		| "client_secret_post"
		| "private_key_jwt";
	grant_types?: GrantType[];
	response_types?: "code"[];
	// | "token" // NEVER SUPPORT - depreciated in oAuth2.1
	//---- RFC6749 Spec ----//
	public?: boolean;
	type?: "web" | "native" | "user-agent-based";
	//---- Not Part of RFC7591 Spec ----//
	disabled?: boolean;
	skip_consent?: boolean;
	enable_end_session?: boolean;
	/**
	 * Whether this client requires PKCE for authorization code flow.
	 *
	 * @default true
	 *
	 * Note: PKCE is always required for public clients and when
	 * requesting offline_access scope, regardless of this setting.
	 */
	require_pkce?: boolean;
	/**
	 * Subject identifier type for this client.
	 *
	 * @see https://openid.net/specs/openid-connect-core-1_0.html#SubjectIDTypes
	 */
	subject_type?: "public" | "pairwise";
	//---- All other metadata ----//
	reference_id?: string;
	[key: string]: unknown;
}

/**
 * Resource metadata server as defined by RFC 9728
 *
 * @see https://datatracker.ietf.org/doc/html/rfc9728#Terminology
 */
export interface ResourceServerMetadata {
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
	bearer_methods_supported?: BearerMethodsSupported[];
	resource_signing_alg_values_supported?: JWSAlgorithms[];
	resource_name?: string;
	resource_documentation?: string;
	resource_policy_uri?: string;
	resource_tos_uri?: string;
	tls_client_certificate_bound_access_tokens?: boolean;
	authorization_details_types_supported?: string;
	/* cspell:disable-next-line */
	dpop_signing_alg_values_supported?: JWSAlgorithms[];
	/* cspell:disable-next-line */
	dpop_bound_access_tokens_required?: boolean;
}
