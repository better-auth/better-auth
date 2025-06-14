import { z } from "zod";
import { generateId } from "../../../utils";

// Core RBAC Schemas
export const permissionSchema = z.object({
	id: z.string().default(generateId),
	name: z.string(),
	resource: z.string(),
	action: z.string(),
	description: z.string().optional(),
	isSystem: z.boolean().default(false),
	createdAt: z.date().default(() => new Date()),
	updatedAt: z.date().default(() => new Date()),
});

export const roleSchema = z.object({
	id: z.string().default(generateId),
	name: z.string(),
	description: z.string().optional(),
	isSystem: z.boolean().default(false),
	organizationId: z.string().optional(), // null for global roles
	level: z.number().default(0), // for role hierarchy
	parentRoleId: z.string().optional(),
	createdAt: z.date().default(() => new Date()),
	updatedAt: z.date().default(() => new Date()),
});

export const rolePermissionSchema = z.object({
	id: z.string().default(generateId),
	roleId: z.string(),
	permissionId: z.string(),
	granted: z.boolean().default(true),
	conditions: z.string().optional(), // JSON string for conditional permissions
	createdAt: z.date().default(() => new Date()),
});

export const userRoleSchema = z.object({
	id: z.string().default(generateId),
	userId: z.string(),
	roleId: z.string(),
	organizationId: z.string().optional(),
	teamId: z.string().optional(),
	assignedAt: z.date().default(() => new Date()),
	assignedBy: z.string(),
	expiresAt: z.date().optional(),
	isActive: z.boolean().default(true),
});

export const resourceSchema = z.object({
	id: z.string().default(generateId),
	name: z.string(),
	type: z.string(),
	organizationId: z.string().optional(),
	teamId: z.string().optional(),
	ownerId: z.string().optional(),
	metadata: z.string().optional(), // JSON string
	createdAt: z.date().default(() => new Date()),
	updatedAt: z.date().default(() => new Date()),
});

export const resourcePermissionSchema = z.object({
	id: z.string().default(generateId),
	resourceId: z.string(),
	userId: z.string().optional(),
	roleId: z.string().optional(),
	permissionId: z.string(),
	granted: z.boolean().default(true),
	conditions: z.string().optional(),
	createdAt: z.date().default(() => new Date()),
});

export const auditLogSchema = z.object({
	id: z.string().default(generateId),
	action: z.string(),
	resource: z.string(),
	resourceId: z.string().optional(),
	userId: z.string(),
	organizationId: z.string().optional(),
	details: z.string().optional(), // JSON string
	ipAddress: z.string().optional(),
	userAgent: z.string().optional(),
	timestamp: z.date().default(() => new Date()),
});

export const policySchema = z.object({
	id: z.string().default(generateId),
	name: z.string(),
	description: z.string().optional(),
	organizationId: z.string().optional(),
	rules: z.string(), // JSON string for complex policy rules
	isActive: z.boolean().default(true),
	priority: z.number().default(0),
	createdAt: z.date().default(() => new Date()),
	updatedAt: z.date().default(() => new Date()),
});

// Combined schema for Better Auth plugin
export const schema = {
	role: {
		modelName: "role",
		fields: {
			name: {
				type: "string",
				required: true,
				sortable: true,
			},
			description: {
				type: "string",
				required: false,
			},
			organizationId: {
				type: "string",
				required: true,
				references: {
					model: "organization",
					field: "id",
				},
			},
			level: {
				type: "number",
				required: false,
				defaultValue: 0,
			},
			parentRoleId: {
				type: "string",
				required: false,
				references: {
					model: "role",
					field: "id",
				},
			},
			isSystem: {
				type: "boolean",
				required: false,
				defaultValue: false,
			},
			metadata: {
				type: "string",
				required: false,
			},
			createdAt: {
				type: "date",
				required: true,
			},
		},
	},
	permission: {
		modelName: "permission",
		fields: {
			name: {
				type: "string",
				required: true,
				sortable: true,
			},
			resource: {
				type: "string",
				required: true,
				sortable: true,
			},
			action: {
				type: "string",
				required: true,
				sortable: true,
			},
			description: {
				type: "string",
				required: false,
			},
			organizationId: {
				type: "string",
				required: true,
				references: {
					model: "organization",
					field: "id",
				},
			},
			isSystem: {
				type: "boolean",
				required: false,
				defaultValue: false,
			},
			metadata: {
				type: "string",
				required: false,
			},
			createdAt: {
				type: "date",
				required: true,
			},
		},
	},
	rolePermission: {
		modelName: "rolePermission",
		fields: {
			roleId: {
				type: "string",
				required: true,
				references: {
					model: "role",
					field: "id",
				},
			},
			permissionId: {
				type: "string",
				required: true,
				references: {
					model: "permission",
					field: "id",
				},
			},
			granted: {
				type: "boolean",
				required: true,
				defaultValue: true,
			},
			conditions: {
				type: "string",
				required: false,
			},
			createdAt: {
				type: "date",
				required: true,
			},
		},
	},		userRole: {
		modelName: "userRole",
		fields: {
			userId: {
				type: "string",
				required: true,
				references: {
					model: "user",
					field: "id",
				},
			},
			roleId: {
				type: "string",
				required: true,
				references: {
					model: "role",
					field: "id",
				},
			},
			organizationId: {
				type: "string",
				required: true,
				references: {
					model: "organization",
					field: "id",
				},
			},
			assignedBy: {
				type: "string",
				required: true,
				references: {
					model: "user",
					field: "id",
				},
			},
			expiresAt: {
				type: "date",
				required: false,
			},
			conditions: {
				type: "string",
				required: false,
			},
			assignedAt: {
				type: "date",
				required: true,
			},
		},
	},
	resource: {
		modelName: "resource",
		fields: {
			name: {
				type: "string",
				required: true,
				sortable: true,
			},
			type: {
				type: "string",
				required: true,
				sortable: true,
			},
			organizationId: {
				type: "string",
				required: true,
				references: {
					model: "organization",
					field: "id",
				},
			},
			parentResourceId: {
				type: "string",
				required: false,
				references: {
					model: "resource",
					field: "id",
				},
			},
			metadata: {
				type: "string",
				required: false,
			},
			createdAt: {
				type: "date",
				required: true,
			},
		},
	},
	auditLog: {
		modelName: "auditLog",
		fields: {
			action: {
				type: "string",
				required: true,
				sortable: true,
			},
			resource: {
				type: "string",
				required: true,
				sortable: true,
			},
			resourceId: {
				type: "string",
				required: false,
			},
			userId: {
				type: "string",
				required: true,
				references: {
					model: "user",
					field: "id",
				},
			},
			organizationId: {
				type: "string",
				required: true,
				references: {
					model: "organization",
					field: "id",
				},
			},
			details: {
				type: "string",
				required: false,
			},
			ipAddress: {
				type: "string",
				required: false,
			},
			userAgent: {
				type: "string",
				required: false,
			},
			timestamp: {
				type: "date",
				required: true,
			},
		},
	},
} as const;

// Type exports
export type Permission = z.infer<typeof permissionSchema>;
export type Role = z.infer<typeof roleSchema>;
export type RolePermission = z.infer<typeof rolePermissionSchema>;
export type UserRole = z.infer<typeof userRoleSchema>;
export type Resource = z.infer<typeof resourceSchema>;
export type ResourcePermission = z.infer<typeof resourcePermissionSchema>;
export type AuditLog = z.infer<typeof auditLogSchema>;
export type Policy = z.infer<typeof policySchema>;

// Input types
export type PermissionInput = z.input<typeof permissionSchema>;
export type RoleInput = z.input<typeof roleSchema>;
export type RolePermissionInput = z.input<typeof rolePermissionSchema>;
export type UserRoleInput = z.input<typeof userRoleSchema>;
export type ResourceInput = z.input<typeof resourceSchema>;
export type ResourcePermissionInput = z.input<typeof resourcePermissionSchema>;
export type AuditLogInput = z.input<typeof auditLogSchema>;
export type PolicyInput = z.input<typeof policySchema>;

// Common enums and constants
export const SYSTEM_PERMISSIONS = {
	// Organization permissions
	ORGANIZATION_CREATE: 'organization:create',
	ORGANIZATION_READ: 'organization:read',
	ORGANIZATION_UPDATE: 'organization:update',
	ORGANIZATION_DELETE: 'organization:delete',
	ORGANIZATION_MANAGE_SETTINGS: 'organization:manage_settings',
	
	// Member permissions
	MEMBER_INVITE: 'member:invite',
	MEMBER_READ: 'member:read',
	MEMBER_UPDATE: 'member:update',
	MEMBER_REMOVE: 'member:remove',
	MEMBER_MANAGE_ROLES: 'member:manage_roles',
	
	// Team permissions
	TEAM_CREATE: 'team:create',
	TEAM_READ: 'team:read',
	TEAM_UPDATE: 'team:update',
	TEAM_DELETE: 'team:delete',
	TEAM_MANAGE_MEMBERS: 'team:manage_members',
	
	// Role permissions
	ROLE_CREATE: 'role:create',
	ROLE_READ: 'role:read',
	ROLE_UPDATE: 'role:update',
	ROLE_DELETE: 'role:delete',
	ROLE_ASSIGN: 'role:assign',
	
	// Resource permissions
	RESOURCE_CREATE: 'resource:create',
	RESOURCE_READ: 'resource:read',
	RESOURCE_UPDATE: 'resource:update',
	RESOURCE_DELETE: 'resource:delete',
	RESOURCE_SHARE: 'resource:share',
	
	// Audit permissions
	AUDIT_READ: 'audit:read',
	AUDIT_EXPORT: 'audit:export',
} as const;

export const SYSTEM_ROLES = {
	SUPER_ADMIN: 'super_admin',
	ORGANIZATION_OWNER: 'organization_owner',
	ORGANIZATION_ADMIN: 'organization_admin',
	TEAM_LEAD: 'team_lead',
	MEMBER: 'member',
	VIEWER: 'viewer',
} as const;

export const RESOURCE_TYPES = {
	ORGANIZATION: 'organization',
	TEAM: 'team',
	PROJECT: 'project',
	DOCUMENT: 'document',
	FILE: 'file',
	INTEGRATION: 'integration',
} as const;

// Permission evaluation contexts
export interface PermissionContext {
	userId: string;
	organizationId?: string;
	teamId?: string;
	resourceId?: string;
	resourceType?: string;
	action: string;
	conditions?: Record<string, any>;
}

export interface PolicyRule {
	effect: 'allow' | 'deny';
	resource?: string;
	action?: string;
	condition?: string; // JavaScript expression
	priority?: number;
}

export interface RoleHierarchy {
	roleId: string;
	level: number;
	children: RoleHierarchy[];
	inheritsFrom?: string[];
}

// Extended member type with RBAC roles
export interface RbacMember {
	id: string;
	userId: string;
	organizationId: string;
	teamId?: string;
	roles: UserRole[];
	effectivePermissions: string[];
	createdAt: Date;
	updatedAt: Date;
}
