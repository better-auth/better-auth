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

/** The authenticated identity attached to a SCIM request. */
export type SCIMPrincipal =
	| SCIMStaticBearerPrincipal
	| SCIMOAuthBearerPrincipal;

/** Bearer request data passed to an application-owned token verifier. */
export interface SCIMBearerTokenVerificationInput {
	token: string;
	method: string;
	path: string;
	headers: Headers;
}

/** Verified bearer claims resolved before a SCIM request is authorized. */
export interface SCIMBearerTokenVerificationResult {
	connectionId: string;
	credentialId: string;
	scopes: readonly SCIMScope[];
	expiresAt?: Date;
}

/** Application-owned verification boundary for OAuth access tokens. */
export interface SCIMAuthenticationOptions {
	verifyBearerToken(
		input: SCIMBearerTokenVerificationInput,
	):
		| SCIMBearerTokenVerificationResult
		| null
		| Promise<SCIMBearerTokenVerificationResult | null>;
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
}

/** A normalized email supplied to application-owned SCIM integrations. */
export interface SCIMCanonicalEmail {
	value: string;
	primary: boolean;
	type?: string;
}

/** The normalized SCIM User supplied to application-owned integrations. */
export interface SCIMCanonicalUser {
	externalId?: string;
	userName: string;
	primaryEmail: string;
	displayName: string;
	name: SCIMCanonicalName;
	emails: readonly SCIMCanonicalEmail[];
	active: boolean;
}

/** One connection-owned identity source participating in aggregate lifecycle. */
export interface SCIMIdentitySource {
	id: string;
	connectionId: string;
	provisioningDomainId: string;
	active: boolean;
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
	userId: string;
	active: boolean;
	profileSourceId?: string;
	sources: readonly SCIMIdentitySource[];
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

/** Configuration for the SCIM plugin. */
export interface SCIMOptions {
	/** Code-defined provisioning connections accepted by the SCIM endpoint. */
	connections: readonly SCIMConnectionOptions[];
	/** Optional verification boundary for OAuth bearer access tokens. */
	authentication?: SCIMAuthenticationOptions;
	/** Optional explicit linking and global lifecycle integration. */
	identity?: SCIMIdentity;
	/** Optional application or tenancy projection. No projection grants access. */
	projection?: SCIMProjection;
}
