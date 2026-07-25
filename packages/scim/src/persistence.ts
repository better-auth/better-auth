import type {
	SCIMAuthorizationSource,
	SCIMConnectionDecommissionStatus,
} from "./configuration";

/** Immutable connection scope plus durable decommission reconciliation state. */
export interface SCIMConnectionBinding {
	id: string;
	connectionId: string;
	connectionKey: string;
	provisioningDomainId: string;
	createdAt: Date;
	decommissionStatus: SCIMConnectionDecommissionStatus;
	decommissionCursorUserId?: string | null;
	decommissionReconciledUserCount: number;
	decommissionBatchCount: number;
	decommissionRevision: number;
	decommissionedAt?: Date | null;
	decommissionCompletedAt?: Date | null;
	decommissionLeaseId?: string | null;
	decommissionLeaseExpiresAt?: Date | null;
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

/** A direct connection-owned Group-to-User membership edge. */
export interface SCIMGroupMember {
	id: string;
	connectionId: string;
	groupId: string;
	scimUserId: string;
	membershipKey: string;
	createdAt: Date;
}

/** A persisted role grant with its exact SCIM source. */
export interface SCIMProjectionGrant {
	id: string;
	connectionId: string;
	provisioningDomainId: string;
	scimUserId: string;
	userId: string;
	sourceKind: SCIMAuthorizationSource["type"];
	sourceId: string;
	sourceValue?: string | null;
	role: string;
	grantKey: string;
	createdAt: Date;
	updatedAt: Date;
}
