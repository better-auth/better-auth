import type { GenericEndpointContext, User } from "better-auth";
import type { Member } from "better-auth/plugins";

export interface SCIMProvider {
	id: string;
	providerId: string;
	providerKey: string;
	scimToken: string;
	organizationId: string;
}

export type StaticSCIMProvider = {
	providerId: string;
	scimToken: string;
	organizationId?: string;
};

export type SCIMRequiredRoleResolver = (payload: {
	user: User;
	member: Member;
	organizationId: string;
	ctx: GenericEndpointContext;
}) => boolean | Promise<boolean>;

export type SCIMName = {
	formatted?: string;
	givenName?: string;
	familyName?: string;
};

export type SCIMEmail = { value?: string; primary?: boolean };

export type SCIMGroupMemberInput = {
	value?: string;
	$ref?: string;
	display?: string;
	type?: string;
};

export type SCIMGroupInput = {
	externalId?: string;
	displayName: string;
	members?: SCIMGroupMemberInput[];
};

export type MapGroupToRolesInput = {
	group: SCIMGroupInput;
	provider: {
		providerId: string;
		organizationId: string;
	};
};

export type SCIMGroupMemberReference = {
	value: string;
	$ref: string;
	display: string;
	type: "User";
};

export type SCIMUserGroupReference = {
	value: string;
	$ref: string;
	display: string;
};

export interface SCIMGroup {
	id: string;
	providerId: string;
	organizationId: string;
	scimGroupId: string;
	externalId?: string;
	externalIdKey?: string;
	displayName: string;
	createdAt: Date;
	updatedAt?: Date;
}

export interface SCIMGroupMember {
	id: string;
	groupId: string;
	providerId: string;
	organizationId: string;
	userId: string;
	membershipKey: string;
	createdAt: Date;
}

export interface SCIMGroupRole {
	id: string;
	groupId: string;
	role: string;
	roleKey: string;
	createdAt: Date;
}

export interface SCIMGroupRoleGrant {
	id: string;
	groupId: string;
	providerId: string;
	organizationId: string;
	userId: string;
	role: string;
	roleGrantKey: string;
	isRoleProjected: boolean;
	createdAt: Date;
}

export type SCIMOptions = {
	/**
	 * Roles, or a resolver, allowed to manage SCIM providers for an organization.
	 *
	 * Defaults to `["admin", organization.creatorRole ?? "owner"]`.
	 */
	requiredRole?: string[] | SCIMRequiredRoleResolver;
	/**
	 * Code-defined providers. Omit `organizationId` only for app-level SCIM.
	 */
	staticProviders?: StaticSCIMProvider[];
	/**
	 * Maps an incoming SCIM Group resource to Better Auth organization role(s).
	 *
	 * Defaults to using the group's displayName as the role name.
	 */
	mapGroupToRoles?: (
		input: MapGroupToRolesInput,
	) => string | string[] | Promise<string | string[]>;
	/**
	 * Allows SCIM to link an existing user by email. Disabled by default.
	 */
	linkExistingUsers?:
		| boolean
		| {
				/**
				 * Require existing membership in the token's organization.
				 */
				requireExistingOrgMembership?: boolean;
				/**
				 * Full control: return `true` to allow linking the matched user.
				 */
				shouldLinkUser?: (payload: {
					user: User;
					email: string;
					provider: { providerId: string; organizationId?: string };
				}) => boolean | Promise<boolean>;
		  };
	/**
	 * A callback that runs before a new SCIM token is generated.
	 * Runs after the built-in role check, so it can add additional
	 * restrictions but cannot bypass the role requirement.
	 */
	beforeSCIMTokenGenerated?: (payload: {
		user: User;
		member: Member;
		scimToken: string;
	}) => Promise<void>;
	/**
	 * A callback that runs after a new SCIM token is generated.
	 */
	afterSCIMTokenGenerated?: (payload: {
		user: User;
		member: Member;
		scimToken: string;
		scimProvider: SCIMProvider;
	}) => Promise<void>;
	/**
	 * Authorize who may generate a SCIM token. Runs after the built-in checks
	 * (org membership and the required role), so it can add restrictions but
	 * cannot loosen them. Return `false` to deny.
	 */
	canGenerateToken?: (payload: {
		user: User;
		providerId: string;
		organizationId: string;
		member: Member;
	}) => boolean | Promise<boolean>;
	/**
	 * How to store the SCIM token in the database.
	 *
	 * @default "plain"
	 */
	storeSCIMToken?:
		| (
				| "hashed"
				| "plain"
				| "encrypted"
				| { hash: (scimToken: string) => Promise<string> }
				| {
						encrypt: (scimToken: string) => Promise<string>;
						decrypt: (scimToken: string) => Promise<string>;
				  }
		  )
		| undefined;
};
