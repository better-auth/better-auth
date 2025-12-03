/**
 * OIDC Discovery Types
 *
 * Types for the OIDC discovery document and hydrated configuration.
 * Based on OpenID Connect Discovery 1.0 specification.
 *
 * @see https://openid.net/specs/openid-connect-discovery-1_0.html
 */

/**
 * Raw OIDC Discovery Document as returned by the IdP's
 * .well-known/openid-configuration endpoint.
 *
 * Required fields for Better Auth's OIDC support:
 * - issuer
 * - authorization_endpoint
 * - token_endpoint
 * - jwks_uri (required for ID token validation)
 *
 */
export interface OIDCDiscoveryDocument {
	/** REQUIRED. URL using the https scheme that the OP asserts as its Issuer Identifier. */
	issuer: string;

	/** REQUIRED. URL of the OP's OAuth 2.0 Authorization Endpoint. */
	authorization_endpoint: string;

	/**
	 * REQUIRED (spec says "unless only implicit flow is used").
	 * URL of the OP's OAuth 2.0 Token Endpoint.
	 * We only support authorization code flow.
	 */
	token_endpoint: string;

	/** REQUIRED. URL of the OP's JSON Web Key Set document for ID token validation. */
	jwks_uri: string;

	/** RECOMMENDED. URL of the OP's UserInfo Endpoint. */
	userinfo_endpoint?: string;

	/**
	 * OPTIONAL. JSON array containing a list of Client Authentication methods
	 * supported by this Token Endpoint.
	 * Default: ["client_secret_basic"]
	 */
	token_endpoint_auth_methods_supported?: string[];

	/** OPTIONAL. JSON array containing a list of the OAuth 2.0 scope values that this server supports. */
	scopes_supported?: string[];

	/** OPTIONAL. JSON array containing a list of the OAuth 2.0 response_type values that this OP supports. */
	response_types_supported?: string[];

	/** OPTIONAL. JSON array containing a list of the Subject Identifier types that this OP supports. */
	subject_types_supported?: string[];

	/** OPTIONAL. JSON array containing a list of the JWS signing algorithms supported by the OP. */
	id_token_signing_alg_values_supported?: string[];

	/** OPTIONAL. JSON array containing a list of the claim names that the OP may supply values for. */
	claims_supported?: string[];

	/** OPTIONAL. URL of a page containing human-readable information about the OP. */
	service_documentation?: string;

	/** OPTIONAL. Boolean value specifying whether the OP supports use of the claims parameter. */
	claims_parameter_supported?: boolean;

	/** OPTIONAL. Boolean value specifying whether the OP supports use of the request parameter. */
	request_parameter_supported?: boolean;

	/** OPTIONAL. Boolean value specifying whether the OP supports use of the request_uri parameter. */
	request_uri_parameter_supported?: boolean;

	/** OPTIONAL. Boolean value specifying whether the OP requires any request_uri values to be pre-registered. */
	require_request_uri_registration?: boolean;

	/** OPTIONAL. URL of the OP's end session endpoint. */
	end_session_endpoint?: string;

	/** OPTIONAL. URL of the OP's revocation endpoint. */
	revocation_endpoint?: string;

	/** OPTIONAL. URL of the OP's introspection endpoint. */
	introspection_endpoint?: string;

	/** OPTIONAL. JSON array of PKCE code challenge methods supported (e.g., "S256", "plain"). */
	code_challenge_methods_supported?: string[];

	/** Allow additional fields from the discovery document */
	[key: string]: unknown;
}

/**
 * Error codes for OIDC discovery operations.
 */
export type DiscoveryErrorCode =
	/** Request to discovery endpoint timed out */
	| "discovery_timeout"
	/** Discovery endpoint returned 404 or similar */
	| "discovery_not_found"
	/** Discovery endpoint returned invalid JSON */
	| "discovery_invalid_json"
	/** Discovery URL is invalid or malformed */
	| "discovery_invalid_url"
	/** Discovery document issuer doesn't match configured issuer */
	| "issuer_mismatch"
	/** Discovery document is missing required fields */
	| "discovery_incomplete"
	/** IdP only advertises token auth methods that Better Auth doesn't currently support */
	| "unsupported_token_auth_method"
	/** Catch-all for unexpected errors */
	| "discovery_unexpected_error";

/**
 * Custom error class for OIDC discovery failures.
 * Can be caught and mapped to APIError at the edge.
 */
export class DiscoveryError extends Error {
	public readonly code: DiscoveryErrorCode;
	public readonly details?: Record<string, unknown>;

	constructor(
		code: DiscoveryErrorCode,
		message: string,
		details?: Record<string, unknown>,
		options?: { cause?: unknown },
	) {
		super(message, options);
		this.name = "DiscoveryError";
		this.code = code;
		this.details = details;

		// Maintains proper stack trace for where the error was thrown
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, DiscoveryError);
		}
	}
}

/**
 * Hydrated OIDC configuration after discovery.
 * This is the normalized shape that gets persisted to the database
 * or merged into provider config at runtime.
 *
 * Field names are camelCase to match Better Auth conventions.
 */
export interface HydratedOIDCConfig {
	/** The issuer URL (validated to match configured issuer) */
	issuer: string;

	/** The discovery endpoint URL */
	discoveryEndpoint: string;

	/** URL of the authorization endpoint */
	authorizationEndpoint: string;

	/** URL of the token endpoint */
	tokenEndpoint: string;

	/** URL of the JWKS endpoint */
	jwksEndpoint: string;

	/** URL of the userinfo endpoint (optional) */
	userInfoEndpoint?: string;

	/** Token endpoint authentication method */
	tokenEndpointAuthentication?: "client_secret_basic" | "client_secret_post";

	/** Scopes supported by the IdP */
	scopesSupported?: string[];
}

/**
 * Parameters for the discoverOIDCConfig function.
 */
export interface DiscoverOIDCConfigParams {
	/** The issuer URL to discover configuration from */
	issuer: string;

	/**
	 * Optional existing configuration.
	 * Values provided here will override discovered values.
	 */
	existingConfig?: Partial<HydratedOIDCConfig>;

	/**
	 * Optional custom discovery endpoint URL.
	 * If not provided, defaults to <issuer>/.well-known/openid-configuration
	 */
	discoveryEndpoint?: string;

	/**
	 * Optional timeout in milliseconds for the discovery request.
	 * @default 10000 (10 seconds)
	 */
	timeout?: number;
}

/**
 * Required fields that must be present in a valid discovery document.
 */
export const REQUIRED_DISCOVERY_FIELDS = [
	"issuer",
	"authorization_endpoint",
	"token_endpoint",
	"jwks_uri",
] as const;

export type RequiredDiscoveryField = (typeof REQUIRED_DISCOVERY_FIELDS)[number];
