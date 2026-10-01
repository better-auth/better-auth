import type { DBAdapter, DBTransactionAdapter } from "better-auth";

/** An operation scope carried by an authenticated SCIM principal. */
export type SCIMScope =
	| "scim.users.read"
	| "scim.users.write"
	| "scim.groups.read"
	| "scim.groups.write";

/** One static bearer credential accepted by a SCIM connection. */
export interface SCIMBearerCredentialOptions {
	type: "bearer";
	/** Stable identifier included in the authenticated SCIM principal. */
	id: string;
	/** Opaque secret presented in the HTTP Authorization header. */
	token: string;
	/** Operation scopes granted to this credential. Defaults to every scope. */
	scopes?: readonly SCIMScope[];
	/** Optional hard expiry used for staged credential rotation. */
	expiresAt?: Date;
}

/** A code-defined SCIM provisioning connection. */
export interface SCIMConnectionOptions {
	/** Immutable identifier used to scope every provisioned resource. */
	id: string;
	/** Active and retiring credentials accepted for this connection. */
	credentials: readonly SCIMBearerCredentialOptions[];
	/**
	 * Application-owned boundary that receives provisioned resources.
	 * Defaults to the connection id.
	 */
	provisioningDomainId?: string;
}

/** The connection resolved from an authenticated SCIM request. */
export interface SCIMConnection {
	id: string;
	provisioningDomainId: string;
}

interface SCIMPrincipalFields {
	connectionId: string;
	provisioningDomainId: string;
	credentialId: string;
	scopes: readonly SCIMScope[];
	expiresAt?: Date;
}

/** A principal authenticated from a code-defined static bearer credential. */
export interface SCIMStaticBearerPrincipal extends SCIMPrincipalFields {
	type: "static-bearer";
}

/** A principal authenticated by an application-owned OAuth verifier. */
export interface SCIMOAuthBearerPrincipal extends SCIMPrincipalFields {
	type: "oauth-bearer";
}

/** A principal authenticated by the framework-managed connection catalog. */
export interface SCIMManagedBearerPrincipal extends SCIMPrincipalFields {
	type: "managed-bearer";
}

/** The authenticated identity attached to a SCIM request. */
export type SCIMPrincipal =
	| SCIMStaticBearerPrincipal
	| SCIMManagedBearerPrincipal
	| SCIMOAuthBearerPrincipal;

/** Bearer request data passed to an application-owned token verifier. */
export interface SCIMBearerTokenVerificationInput {
	token: string;
	method: string;
	path: string;
	headers: Headers;
}

/** Verified bearer claims resolved before a SCIM request is authorized. */
export interface SCIMDeclaredConnectionVerificationResult {
	/** Identifier of a connection declared in `SCIMOptions.connections`. */
	connectionId: string;
	/** A configured-connection result cannot also resolve a connection. */
	connection?: never;
	credentialId: string;
	scopes: readonly SCIMScope[];
	expiresAt?: Date;
}

/**
 * Verified bearer claims and their application-resolved provisioning
 * connection.
 */
export interface SCIMResolvedConnectionVerificationResult {
	/**
	 * Application-owned connection resolved in the same operation that verifies
	 * the bearer credential.
	 */
	connection: SCIMConnection;
	/** A resolved-connection result cannot also reference a configured ID. */
	connectionId?: never;
	credentialId: string;
	scopes: readonly SCIMScope[];
	expiresAt?: Date;
}

/** A configured or application-resolved bearer token verification. */
export type SCIMBearerTokenVerification =
	| SCIMDeclaredConnectionVerificationResult
	| SCIMResolvedConnectionVerificationResult;

/** Database access available to an application-owned bearer token verifier. */
export interface SCIMBearerTokenVerificationContext {
	database: Pick<DBAdapter, "findOne" | "update">;
}

/** Application-owned verification boundary for bearer access tokens. */
export interface SCIMAuthenticationOptions {
	verifyBearerToken(
		input: SCIMBearerTokenVerificationInput,
		context: SCIMBearerTokenVerificationContext,
	):
		| SCIMBearerTokenVerification
		| null
		| Promise<SCIMBearerTokenVerification | null>;
}

/** Configuration for the optional SCIM-owned connection catalog. */
export interface SCIMManagedConnectionOptions {
	/**
	 * Independent HMAC secret used to digest managed bearer credentials.
	 * Must contain at least 32 characters.
	 */
	credentialHashSecret: string;
	/**
	 * Maximum number of unexpired, non-revoked credentials per connection.
	 * Must be an integer from `1` through `100`. Defaults to `5`.
	 */
	maxActiveCredentials?: number;
	/**
	 * Minimum interval between persisted last-used updates for a credential.
	 * Must be a nonnegative integer. Defaults to `300` seconds.
	 */
	lastUsedWriteIntervalSeconds?: number;
}

/** Durable lifecycle state for one persisted SCIM connection binding. */
export type SCIMConnectionDecommissionStatus =
	| "active"
	| "reconciling"
	| "complete";

/** Components of a SCIM User's name. */
export interface SCIMName {
	formatted?: string;
	givenName?: string;
	familyName?: string;
	middleName?: string;
	honorificPrefix?: string;
	honorificSuffix?: string;
}

/** One email address supplied on a SCIM User resource. */
export interface SCIMEmail {
	value: string;
	primary?: boolean;
	type?: string;
}

/** A normalized name supplied to application-owned SCIM integrations. */
export interface SCIMCanonicalName {
	formatted: string;
	givenName?: string;
	familyName?: string;
	middleName?: string;
	honorificPrefix?: string;
	honorificSuffix?: string;
}

/** A normalized email supplied to application-owned SCIM integrations. */
export interface SCIMCanonicalEmail {
	value: string;
	primary: boolean;
	type?: string;
}

/** A normalized phone number supplied on a SCIM User resource. */
export interface SCIMCanonicalPhoneNumber {
	value: string;
	type?: string;
	primary?: boolean;
}

/** A normalized postal address supplied on a SCIM User resource. */
export interface SCIMCanonicalAddress {
	formatted?: string;
	streetAddress?: string;
	locality?: string;
	region?: string;
	postalCode?: string;
	country?: string;
	type?: string;
	primary?: boolean;
}

/** A normalized role supplied on a SCIM User resource. */
export interface SCIMCanonicalRole {
	value: string;
	display?: string;
	type?: string;
	primary?: boolean;
}

/** A normalized entitlement supplied on a SCIM User resource. */
export interface SCIMCanonicalEntitlement {
	value: string;
	display?: string;
	type?: string;
	primary?: boolean;
}

/** A manager reference containing an identifier, resource URI, or both. */
export type SCIMCanonicalManager =
	| { value: string; $ref?: string }
	| { value?: string; $ref: string };

/** Supported attributes from the standard Enterprise User extension. */
export interface SCIMEnterpriseUser {
	employeeNumber?: string;
	costCenter?: string;
	organization?: string;
	division?: string;
	department?: string;
	manager?: SCIMCanonicalManager;
}

/** The normalized SCIM User supplied to application-owned integrations. */
export interface SCIMCanonicalUser {
	schemas: readonly string[];
	externalId?: string;
	userName: string;
	primaryEmail: string;
	displayName: string;
	name: SCIMCanonicalName;
	emails: readonly SCIMCanonicalEmail[];
	title?: string;
	userType?: string;
	preferredLanguage?: string;
	locale?: string;
	timezone?: string;
	phoneNumbers?: readonly SCIMCanonicalPhoneNumber[];
	addresses?: readonly SCIMCanonicalAddress[];
	roles?: readonly SCIMCanonicalRole[];
	entitlements?: readonly SCIMCanonicalEntitlement[];
	enterprise?: SCIMEnterpriseUser;
	active: boolean;
}

/** One connection-owned identity source participating in aggregate lifecycle. */
export interface SCIMIdentitySource {
	readonly id: string;
	readonly connectionId: string;
	readonly provisioningDomainId: string;
	readonly active: boolean;
}

/** Explicit create-or-link decision for an incoming SCIM User. */
export type SCIMIdentityResolution =
	| { action: "create" }
	| {
			action: "link";
			userId: string;
			profile: "manage" | "preserve";
	  };

/** Canonical incoming identity passed to application-owned resolution. */
export interface SCIMIdentityResolutionInput {
	connectionId: string;
	provisioningDomainId: string;
	resource: SCIMCanonicalUser;
}

/** Read context for resolving an incoming SCIM User before its transaction. */
export interface SCIMIdentityResolutionContext {
	database: Pick<DBAdapter, "count" | "findMany" | "findOne">;
}

/** Complete global lifecycle state for one linked Better Auth user. */
export interface SCIMIdentityState {
	readonly userId: string;
	readonly active: boolean;
	readonly profileSourceId?: string;
	readonly sources: readonly SCIMIdentitySource[];
}

/** Transaction-bound context shared by identity and access reconciliation. */
export interface SCIMTransactionContext {
	database: DBTransactionAdapter;
}

/** Explicit identity linking and application lifecycle reconciliation. */
export interface SCIMIdentity {
	/**
	 * Resolves a stable application-owned mapping. Returning `link` must not be
	 * based on an unverified email match.
	 */
	resolveUser?(
		input: SCIMIdentityResolutionInput,
		context: SCIMIdentityResolutionContext,
	): SCIMIdentityResolution | Promise<SCIMIdentityResolution>;
	/** Reconciles global enabled or disabled state inside the SCIM transaction. */
	reconcileUser?(
		input: SCIMIdentityState,
		context: SCIMTransactionContext,
	): void | Promise<void>;
}

/** A SCIM Group used as an application authorization source. */
export interface SCIMGroupAuthorizationSource {
	type: "group";
	/** Stable source identity; currently the SCIM Group resource id. */
	id: string;
	externalId?: string;
	displayName: string;
}

/** A canonical SCIM fact that may be mapped to application authorization. */
export type SCIMAuthorizationSource = SCIMGroupAuthorizationSource;

/** One validated, source-aware role grant passed to a projection. */
export interface SCIMProjectedRoleGrant {
	source: SCIMAuthorizationSource;
	role: string;
}

/** The complete desired projection state for one Better Auth user. */
export interface SCIMProjectedUserState {
	provisioningDomainId: string;
	userId: string;
	active: boolean;
	sources: readonly SCIMIdentitySource[];
	grants: readonly SCIMProjectedRoleGrant[];
}

/** Input passed to an application's SCIM role mapper. */
export interface SCIMRoleMappingInput {
	connectionId: string;
	provisioningDomainId: string;
	scimUserId: string;
	userId: string;
	source: SCIMAuthorizationSource;
}

/** Input passed to an application's SCIM role existence check. */
export interface SCIMRoleExistenceInput {
	connectionId: string;
	provisioningDomainId: string;
	role: string;
}

/** Maps canonical SCIM authorization sources to application roles. */
export interface SCIMRoleProjection {
	/** Maps one source fact to opaque application role slugs. */
	map(
		input: SCIMRoleMappingInput,
		context: SCIMTransactionContext,
	): readonly string[] | undefined | Promise<readonly string[] | undefined>;
	/** Confirms that a mapped role exists in the target domain. */
	exists(
		input: SCIMRoleExistenceInput,
		context: SCIMTransactionContext,
	): boolean | Promise<boolean>;
}

/** Maps canonical SCIM facts to an application's access model. */
export interface SCIMProjection {
	roles?: SCIMRoleProjection;
	/**
	 * Reconciles the complete effective state. Implementations must be
	 * idempotent and must use the supplied transaction for database writes.
	 */
	reconcileUser(
		input: SCIMProjectedUserState,
		context: SCIMTransactionContext,
	): void | Promise<void>;
}

/** Microsoft Entra provisioning client compatibility. */
export interface SCIMMicrosoftEntraCompatibilityOptions {
	/**
	 * Accept Microsoft's classic, attribute-less Group schema marker on
	 * `POST /Groups`. The marker is never advertised, persisted, or returned.
	 * Defaults to `false`.
	 */
	acceptLegacyGroupSchema?: boolean;
}

/** Narrow ingress compatibility for documented provider request shapes. */
export interface SCIMCompatibilityOptions {
	microsoftEntra?: SCIMMicrosoftEntraCompatibilityOptions;
}

/** Configuration for the SCIM plugin. */
export interface SCIMOptions {
	/**
	 * Code-defined provisioning connections accepted by the SCIM endpoint.
	 * May be empty when an application verifier or the managed connection
	 * catalog resolves connections.
	 */
	connections: readonly SCIMConnectionOptions[];
	/** Optional verification boundary for bearer access tokens. */
	authentication?: SCIMAuthenticationOptions;
	/** Optional SCIM-owned persisted connection and credential catalog. */
	managedConnections?: SCIMManagedConnectionOptions;
	/** Optional explicit linking and global lifecycle integration. */
	identity?: SCIMIdentity;
	/** Optional application or tenancy projection. No projection grants access. */
	projection?: SCIMProjection;
	/** Narrow ingress compatibility for documented provider request shapes. */
	compatibility?: SCIMCompatibilityOptions;
}
