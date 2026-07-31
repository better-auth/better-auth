import type { SchemaClient } from "./types";

/**
 * Complete internal OAuth client record vocabulary.
 *
 * `satisfies Record<keyof SchemaClient, true>` makes additions to SchemaClient
 * fail type checking until this boundary is deliberately updated.
 */
const OAUTH_CLIENT_RECORD_FIELDS = {
	clientId: true,
	clientSecret: true,
	clientDiscoveryId: true,
	disabled: true,
	scopes: true,
	clientCredentialsScopes: true,
	userId: true,
	createdAt: true,
	updatedAt: true,
	expiresAt: true,
	name: true,
	uri: true,
	icon: true,
	contacts: true,
	tos: true,
	policy: true,
	softwareId: true,
	softwareVersion: true,
	softwareStatement: true,
	redirectUris: true,
	postLogoutRedirectUris: true,
	backchannelLogoutUri: true,
	backchannelLogoutSessionRequired: true,
	tokenEndpointAuthMethod: true,
	grantTypes: true,
	responseTypes: true,
	applicationType: true,
	jwks: true,
	jwksUri: true,
	requirePKCE: true,
	dpopBoundAccessTokens: true,
	skipConsent: true,
	enableEndSession: true,
	subjectType: true,
	referenceId: true,
	metadata: true,
} as const satisfies Record<keyof SchemaClient, true>;

const OAUTH_CLIENT_RECORD_FIELD_NAMES = Object.freeze(
	Object.keys(OAUTH_CLIENT_RECORD_FIELDS) as (keyof SchemaClient)[],
);

/**
 * Canonical wire fields emitted by schemaToOAuth. They are mapped explicitly
 * and therefore must never also survive inside the opaque metadata envelope.
 */
const OAUTH_CLIENT_WIRE_FIELD_NAMES = [
	"client_id",
	"client_secret",
	"client_secret_expires_at",
	"scope",
	"user_id",
	"client_id_issued_at",
	"client_name",
	"client_uri",
	"logo_uri",
	"contacts",
	"tos_uri",
	"policy_uri",
	"jwks",
	"jwks_uri",
	"software_id",
	"software_version",
	"software_statement",
	"redirect_uris",
	"post_logout_redirect_uris",
	"backchannel_logout_uri",
	"backchannel_logout_session_required",
	"token_endpoint_auth_method",
	"grant_types",
	"response_types",
	"application_type",
	"disabled",
	"skip_consent",
	"enable_end_session",
	"require_pkce",
	"dpop_bound_access_tokens",
	"subject_type",
	"reference_id",
] as const;

const OPAQUE_METADATA_RESERVED_FIELDS = new Set<string>([
	...OAUTH_CLIENT_RECORD_FIELD_NAMES,
	...OAUTH_CLIENT_WIRE_FIELD_NAMES,
	"public",
	"type",
	"resources",
	"client_credentials_scopes",
]);

const CIMD_FORBIDDEN_SERVER_FIELD_NAMES = new Set([
	"disabled",
	"client_secret",
	"client_secret_expires_at",
	"client_id_issued_at",
	"skip_consent",
	"enable_end_session",
	"require_pkce",
	"reference_id",
	"user_id",
	"resources",
	"clientSecret",
	"clientDiscoveryId",
	"skipConsent",
	"enableEndSession",
	"requirePKCE",
	"referenceId",
	"userId",
	"clientId",
	"applicationType",
	"tokenEndpointAuthMethod",
	"redirectUris",
	"postLogoutRedirectUris",
	"grantTypes",
	"responseTypes",
	"scopes",
	"expiresAt",
	"createdAt",
	"updatedAt",
	"softwareId",
	"softwareVersion",
	"softwareStatement",
	"backchannelLogoutUri",
	"backchannelLogoutSessionRequired",
	"jwksUri",
	"dpopBoundAccessTokens",
	"subjectType",
]);

export function isForbiddenCimdClientMetadataField(field: string): boolean {
	return CIMD_FORBIDDEN_SERVER_FIELD_NAMES.has(field);
}

export function stripReservedOAuthClientMetadataExtensions(
	metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
	if (!metadata) return undefined;
	return Object.fromEntries(
		Object.entries(metadata).filter(
			([field]) => !OPAQUE_METADATA_RESERVED_FIELDS.has(field),
		),
	);
}
