import type { OrganizationOptions } from "../organization";
import type { RbacHooks } from "./rbac-hooks";

export interface RbacOrganizationOptions extends OrganizationOptions {
	/**
	 * Enable database-level RBAC
	 */
	rbac?: {
		/**
		 * Enable RBAC features
		 */
		enabled: boolean;

		/**
		 * Enable audit logging for all RBAC operations
		 * @default true
		 */
		enableAuditLog?: boolean;

		/**
		 * Enable the policy engine for advanced permission evaluation
		 * @default false
		 */
		enablePolicyEngine?: boolean;

		/**
		 * Cache TTL for permission evaluations in seconds
		 * @default 300 (5 minutes)
		 */
		cacheTTL?: number;

		/**
		 * Enable role hierarchy support
		 * @default true
		 */
		enableRoleHierarchy?: boolean;

		/**
		 * Enable resource-level permissions
		 * @default true
		 */
		enableResourcePermissions?: boolean;

		/**
		 * Default system roles to create for new organizations
		 */
		defaultRoles?: {
			/**
			 * Name of the role
			 */
			name: string;
			/**
			 * Description of the role
			 */
			description?: string;
			/**
			 * Role level for hierarchy (lower numbers = higher privilege)
			 */
			level?: number;
			/**
			 * List of permissions for this role
			 */
			permissions: string[];
			/**
			 * Whether this role is assigned to the organization creator
			 */
			isCreatorRole?: boolean;
		}[];

		/**
		 * Custom permissions to create for the organization
		 */
		customPermissions?: {
			/**
			 * Unique name for the permission (e.g., "project:create")
			 */
			name: string;
			/**
			 * Resource type this permission applies to
			 */
			resource: string;
			/**
			 * Action this permission allows
			 */
			action: string;
			/**
			 * Human-readable description
			 */
			description?: string;
		}[];

		/**
		 * Hook functions for customizing RBAC behavior
		 */
		hooks?: RbacHooks;

		/**
		 * Schema customization for RBAC tables
		 */
		schema?: {
			rbacPermission?: {
				modelName?: string;
				fields?: {
					name?: string;
					resource?: string;
					action?: string;
					description?: string;
					isSystem?: string;
					createdAt?: string;
					updatedAt?: string;
				};
			};
			rbacRole?: {
				modelName?: string;
				fields?: {
					name?: string;
					description?: string;
					isSystem?: string;
					organizationId?: string;
					level?: string;
					parentRoleId?: string;
					createdAt?: string;
					updatedAt?: string;
				};
			};
			rbacRolePermission?: {
				modelName?: string;
				fields?: {
					roleId?: string;
					permissionId?: string;
					granted?: string;
					conditions?: string;
					createdAt?: string;
				};
			};
			rbacMemberRole?: {
				modelName?: string;
				fields?: {
					userId?: string;
					roleId?: string;
					organizationId?: string;
					teamId?: string;
					assignedAt?: string;
					assignedBy?: string;
					expiresAt?: string;
					isActive?: string;
				};
			};
			rbacResource?: {
				modelName?: string;
				fields?: {
					name?: string;
					type?: string;
					organizationId?: string;
					teamId?: string;
					ownerId?: string;
					metadata?: string;
					createdAt?: string;
					updatedAt?: string;
				};
			};
			rbacResourcePermission?: {
				modelName?: string;
				fields?: {
					resourceId?: string;
					userId?: string;
					roleId?: string;
					permissionId?: string;
					granted?: string;
					conditions?: string;
					createdAt?: string;
				};
			};
			rbacAuditLog?: {
				modelName?: string;
				fields?: {
					action?: string;
					resource?: string;
					resourceId?: string;
					userId?: string;
					organizationId?: string;
					details?: string;
					ipAddress?: string;
					userAgent?: string;
					timestamp?: string;
				};
			};
			rbacPolicy?: {
				modelName?: string;
				fields?: {
					name?: string;
					description?: string;
					organizationId?: string;
					rules?: string;
					isActive?: string;
					priority?: string;
					createdAt?: string;
					updatedAt?: string;
				};
			};
		};

		/**
		 * Permission evaluation strategy
		 */
		evaluationStrategy?: {
			/**
			 * How to handle multiple roles with conflicting permissions
			 * @default "most_permissive"
			 */
			conflictResolution?:
				| "most_permissive"
				| "most_restrictive"
				| "explicit_deny";

			/**
			 * Whether to use role hierarchy for permission inheritance
			 * @default true
			 */
			useRoleHierarchy?: boolean;

			/**
			 * Whether to check resource-specific permissions
			 * @default true
			 */
			checkResourcePermissions?: boolean;

			/**
			 * Whether to evaluate policies
			 * @default true
			 */
			evaluatePolicies?: boolean;
		};

		/**
		 * Security settings
		 */
		security?: {
			/**
			 * Maximum number of roles a user can have in an organization
			 * @default 10
			 */
			maxRolesPerUser?: number;

			/**
			 * Maximum number of custom roles per organization
			 * @default 50
			 */
			maxCustomRoles?: number;

			/**
			 * Maximum number of permissions per role
			 * @default 100
			 */
			maxPermissionsPerRole?: number;

			/**
			 * Require approval for sensitive role assignments
			 */
			requireApprovalForRoles?: string[];

			/**
			 * Log all permission checks (can be resource intensive)
			 * @default false
			 */
			logAllPermissionChecks?: boolean;

			/**
			 * Rate limiting for permission checks per user
			 */
			permissionCheckRateLimit?: {
				/**
				 * Maximum checks per time window
				 */
				maxChecks: number;
				/**
				 * Time window in seconds
				 */
				windowSeconds: number;
			};
		};

		/**
		 * Integration settings
		 */
		integrations?: {
			/**
			 * External identity providers for role mapping
			 */
			externalProviders?: {
				/**
				 * Provider name (e.g., "google", "okta")
				 */
				provider: string;
				/**
				 * Mapping from external roles to internal roles
				 */
				roleMapping: Record<string, string>;
			}[];

			/**
			 * Webhook URLs for RBAC events
			 */
			webhooks?: {
				/**
				 * Webhook URL
				 */
				url: string;
				/**
				 * Events to send to this webhook
				 */
				events: string[];
				/**
				 * Secret for webhook verification
				 */
				secret?: string;
			}[];
		};
	};
}

// Predefined permission sets for common use cases
export const PERMISSION_SETS = {
	ORGANIZATION_OWNER: [
		"organization:create",
		"organization:read",
		"organization:update",
		"organization:delete",
		"organization:manage_settings",
		"member:invite",
		"member:read",
		"member:update",
		"member:remove",
		"member:manage_roles",
		"team:create",
		"team:read",
		"team:update",
		"team:delete",
		"team:manage_members",
		"role:create",
		"role:read",
		"role:update",
		"role:delete",
		"role:assign",
		"resource:create",
		"resource:read",
		"resource:update",
		"resource:delete",
		"resource:share",
		"audit:read",
		"audit:export",
	],
	ORGANIZATION_ADMIN: [
		"organization:read",
		"organization:update",
		"member:invite",
		"member:read",
		"member:update",
		"member:remove",
		"team:create",
		"team:read",
		"team:update",
		"team:delete",
		"team:manage_members",
		"role:read",
		"role:assign",
		"resource:create",
		"resource:read",
		"resource:update",
		"resource:delete",
		"resource:share",
		"audit:read",
	],
	TEAM_LEAD: [
		"team:read",
		"team:update",
		"team:manage_members",
		"member:read",
		"resource:create",
		"resource:read",
		"resource:update",
		"resource:delete",
		"resource:share",
	],
	MEMBER: [
		"organization:read",
		"member:read",
		"team:read",
		"resource:create",
		"resource:read",
		"resource:update",
		"resource:share",
	],
	VIEWER: ["organization:read", "member:read", "team:read", "resource:read"],
} as const;

// Default role configurations
export const DEFAULT_ROLES = [
	{
		name: "Organization Owner",
		description: "Full access to the organization",
		level: 0,
		permissions: PERMISSION_SETS.ORGANIZATION_OWNER,
		isCreatorRole: true,
	},
	{
		name: "Organization Admin",
		description: "Administrative access to the organization",
		level: 1,
		permissions: PERMISSION_SETS.ORGANIZATION_ADMIN,
	},
	{
		name: "Team Lead",
		description: "Lead a team within the organization",
		level: 2,
		permissions: PERMISSION_SETS.TEAM_LEAD,
	},
	{
		name: "Member",
		description: "Standard member of the organization",
		level: 3,
		permissions: PERMISSION_SETS.MEMBER,
	},
	{
		name: "Viewer",
		description: "Read-only access to the organization",
		level: 4,
		permissions: PERMISSION_SETS.VIEWER,
	},
] as const;

// Common permission configurations
export const COMMON_PERMISSIONS = [
	{
		name: "organization:create",
		resource: "organization",
		action: "create",
		description: "Create new organizations",
	},
	{
		name: "organization:read",
		resource: "organization",
		action: "read",
		description: "View organization details",
	},
	{
		name: "organization:update",
		resource: "organization",
		action: "update",
		description: "Update organization settings",
	},
	{
		name: "organization:delete",
		resource: "organization",
		action: "delete",
		description: "Delete the organization",
	},
	{
		name: "member:invite",
		resource: "member",
		action: "invite",
		description: "Invite new members to the organization",
	},
	{
		name: "member:read",
		resource: "member",
		action: "read",
		description: "View member information",
	},
	{
		name: "member:update",
		resource: "member",
		action: "update",
		description: "Update member information",
	},
	{
		name: "member:remove",
		resource: "member",
		action: "remove",
		description: "Remove members from the organization",
	},
	{
		name: "team:create",
		resource: "team",
		action: "create",
		description: "Create new teams",
	},
	{
		name: "team:read",
		resource: "team",
		action: "read",
		description: "View team information",
	},
	{
		name: "team:update",
		resource: "team",
		action: "update",
		description: "Update team settings",
	},
	{
		name: "team:delete",
		resource: "team",
		action: "delete",
		description: "Delete teams",
	},
	{
		name: "role:create",
		resource: "role",
		action: "create",
		description: "Create new roles",
	},
	{
		name: "role:read",
		resource: "role",
		action: "read",
		description: "View role information",
	},
	{
		name: "role:update",
		resource: "role",
		action: "update",
		description: "Update role permissions",
	},
	{
		name: "role:delete",
		resource: "role",
		action: "delete",
		description: "Delete roles",
	},
	{
		name: "role:assign",
		resource: "role",
		action: "assign",
		description: "Assign roles to users",
	},
] as const;
