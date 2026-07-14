import type { DBAdapter, DBTransactionAdapter } from "better-auth";

/** One static bearer credential accepted by a SCIM connection. */
export interface SCIMBearerCredentialOptions {
	type: "bearer";
	/** Opaque secret presented in the HTTP Authorization header. */
	token: string;
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

/** Durable lifecycle state for one persisted SCIM connection binding. */
export type SCIMConnectionDecommissionStatus =
	| "active"
	| "reconciling"
	| "complete";

/** Immutable connection scope plus durable decommission reconciliation state. */
export interface SCIMConnectionBinding {
	id: string;
	connectionId: string;
	connectionKey: string;
	provisioningDomainId: string;
	createdAt: Date;
	/** Durable progress state for connection retirement. */
	decommissionStatus: SCIMConnectionDecommissionStatus;
	/** Last user whose complete desired state committed successfully. */
	decommissionCursorUserId?: string | null;
	/** Number of distinct users committed across completed batches. */
	decommissionReconciledUserCount: number;
	/** Number of committed reconciliation batches. */
	decommissionBatchCount: number;
	/** Internal compare-and-swap revision for worker fencing. */
	decommissionRevision: number;
	/** Time credentials and source contributions were permanently retired. */
	decommissionedAt?: Date | null;
	/** Time all affected users finished reconciliation. */
	decommissionCompletedAt?: Date | null;
	/** Internal identifier for the worker currently holding the operation. */
	decommissionLeaseId?: string | null;
	/** Time another worker may take over an interrupted operation. */
	decommissionLeaseExpiresAt?: Date | null;
}

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

/** A connection-owned SCIM User resource linked to a Better Auth user. */
export interface SCIMUser {
	id: string;
	connectionId: string;
	provisioningDomainId: string;
	userId: string;
	connectionUserKey: string;
	userName: string;
	userNameKey: string;
	primaryEmail: string;
	workEmailValueIndex: string;
	emailValueIndex: string;
	displayName: string;
	formattedName: string;
	givenName?: string | null;
	familyName?: string | null;
	serializedEmails: string;
	externalId?: string | null;
	externalIdKey?: string | null;
	active: boolean;
	orderKey: string;
	createdAt: Date;
	updatedAt: Date;
}

/** A connection-owned canonical SCIM Group resource. */
export interface SCIMGroup {
	id: string;
	connectionId: string;
	provisioningDomainId: string;
	/** Internal compare-and-swap revision for serializing Group mutations. */
	revision: number;
	displayName: string;
	displayNameKey: string;
	externalId?: string | null;
	externalIdKey?: string | null;
	orderKey: string;
	createdAt: Date;
	updatedAt: Date;
}

/** User-level aggregate that owns global SCIM lifecycle and profile authority. */
export interface SCIMSubject {
	id: string;
	userId: string;
	profileSourceId?: string | null;
	revision: number;
	createdAt: Date;
	updatedAt: Date;
}

/** Internal stable-identifier binding retained after a hard SCIM delete. */
export interface SCIMIdentityTombstone {
	id: string;
	connectionId: string;
	provisioningDomainId: string;
	externalId: string;
	externalIdKey: string;
	userId: string;
	profile: "manage" | "preserve";
	deletedAt: Date;
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
	resource: {
		externalId?: string;
		userName: string;
		primaryEmail: string;
		displayName: string;
		name: SCIMName;
		emails: readonly SCIMEmail[];
		active: boolean;
	};
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

/** A direct connection-owned Group-to-User membership edge. */
export interface SCIMGroupMember {
	id: string;
	connectionId: string;
	groupId: string;
	scimUserId: string;
	membershipKey: string;
	createdAt: Date;
}

/** A canonical SCIM fact that may be mapped to an application role. */
export interface SCIMAuthorizationSource {
	kind: "group";
	/** Stable source identity; currently the SCIM Group resource id. */
	id: string;
	externalId?: string;
	displayName: string;
}

/** One validated, source-aware role grant passed to a projection. */
export interface SCIMProjectedRoleGrant {
	key: string;
	sourceKind: SCIMAuthorizationSource["kind"];
	sourceId: string;
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

/** Transaction-bound context shared by identity and access reconciliation. */
export interface SCIMTransactionContext {
	database: DBTransactionAdapter;
}

/** Maps canonical SCIM facts to an application's access model. */
export interface SCIMProjection {
	roles?: {
		/** Maps one source fact to opaque application role slugs. */
		map(
			input: {
				connectionId: string;
				provisioningDomainId: string;
				scimUserId: string;
				userId: string;
				source: SCIMAuthorizationSource;
			},
			context: SCIMTransactionContext,
		): readonly string[] | undefined | Promise<readonly string[] | undefined>;
		/** Confirms that a mapped role exists in the target domain. */
		exists(
			input: {
				connectionId: string;
				provisioningDomainId: string;
				role: string;
			},
			context: SCIMTransactionContext,
		): boolean | Promise<boolean>;
	};
	/**
	 * Reconciles the complete effective state. Implementations must be
	 * idempotent and must use the supplied transaction for database writes.
	 */
	reconcileUser(
		input: SCIMProjectedUserState,
		context: SCIMTransactionContext,
	): void | Promise<void>;
}

/** A persisted role grant with its exact SCIM source. */
export interface SCIMProjectionGrant {
	id: string;
	connectionId: string;
	provisioningDomainId: string;
	scimUserId: string;
	userId: string;
	sourceKind: SCIMAuthorizationSource["kind"];
	sourceId: string;
	sourceValue?: string | null;
	role: string;
	grantKey: string;
	createdAt: Date;
	updatedAt: Date;
}

/** Configuration for the SCIM plugin. */
export interface SCIMOptions {
	/** Code-defined provisioning connections accepted by the SCIM endpoint. */
	connections: readonly SCIMConnectionOptions[];
	/** Optional explicit linking and global lifecycle integration. */
	identity?: SCIMIdentity;
	/** Optional application or tenancy projection. No projection grants access. */
	projection?: SCIMProjection;
}
