import type { User, Session, AuthContext } from "../../../types";
import type {
	RbacRole,
	RbacPermission,
	RbacUserRole,
	RbacResource,
	RbacAuditLog,
	RbacPolicy,
	PermissionContext,
} from "./rbac-schema";

export interface RbacHookContext {
	context: AuthContext;
	user: User;
	session?: Session;
	organizationId?: string;
	teamId?: string;
	request?: Request;
}

export interface RoleAssignmentHookData {
	userId: string;
	roleId: string;
	organizationId?: string;
	teamId?: string;
	assignedBy: string;
	expiresAt?: Date;
}

export interface PermissionCheckHookData {
	userId: string;
	action: string;
	resource?: string;
	resourceId?: string;
	organizationId?: string;
	teamId?: string;
	context?: Record<string, any>;
}

export interface ResourceOperationHookData {
	resourceId: string;
	resourceType: string;
	operation: "create" | "read" | "update" | "delete";
	userId: string;
	organizationId?: string;
	teamId?: string;
	metadata?: Record<string, any>;
}

export interface RbacHooks {
	// Role management hooks
	beforeRoleCreate?: (
		data: { role: Omit<RbacRole, "id" | "createdAt" | "updatedAt"> },
		context: RbacHookContext,
	) => Promise<
		| void
		| {
				data: Omit<RbacRole, "id" | "createdAt" | "updatedAt">;
		  }
	>;

	afterRoleCreate?: (
		data: { role: RbacRole },
		context: RbacHookContext,
	) => Promise<void>;

	beforeRoleUpdate?: (
		data: { roleId: string; updates: Partial<RbacRole> },
		context: RbacHookContext,
	) => Promise<
		| void
		| {
				updates: Partial<RbacRole>;
		  }
	>;

	afterRoleUpdate?: (
		data: { role: RbacRole; previousRole: RbacRole },
		context: RbacHookContext,
	) => Promise<void>;

	beforeRoleDelete?: (
		data: { roleId: string; role: RbacRole },
		context: RbacHookContext,
	) => Promise<void>;

	afterRoleDelete?: (
		data: { roleId: string; role: RbacRole },
		context: RbacHookContext,
	) => Promise<void>;

	// Permission management hooks
	beforePermissionCreate?: (
		data: { permission: Omit<RbacPermission, "id" | "createdAt" | "updatedAt"> },
		context: RbacHookContext,
	) => Promise<
		| void
		| {
				data: Omit<RbacPermission, "id" | "createdAt" | "updatedAt">;
		  }
	>;

	afterPermissionCreate?: (
		data: { permission: RbacPermission },
		context: RbacHookContext,
	) => Promise<void>;

	// Role assignment hooks
	beforeRoleAssignment?: (
		data: RoleAssignmentHookData,
		context: RbacHookContext,
	) => Promise<
		| void
		| {
				data: RoleAssignmentHookData;
		  }
	>;

	afterRoleAssignment?: (
		data: RoleAssignmentHookData & { userRole: RbacUserRole },
		context: RbacHookContext,
	) => Promise<void>;

	beforeRoleRevocation?: (
		data: {
			userId: string;
			roleId: string;
			organizationId?: string;
			revokedBy: string;
		},
		context: RbacHookContext,
	) => Promise<void>;

	afterRoleRevocation?: (
		data: {
			userId: string;
			roleId: string;
			organizationId?: string;
			revokedBy: string;
		},
		context: RbacHookContext,
	) => Promise<void>;

	// Permission evaluation hooks
	beforePermissionCheck?: (
		data: PermissionCheckHookData,
		context: RbacHookContext,
	) => Promise<
		| void
		| {
				data: PermissionCheckHookData;
		  }
	>;

	afterPermissionCheck?: (
		data: PermissionCheckHookData & { result: boolean; reason?: string },
		context: RbacHookContext,
	) => Promise<void>;

	// Custom permission evaluation
	customPermissionEvaluator?: (
		data: PermissionCheckHookData,
		context: RbacHookContext,
	) => Promise<boolean | null>; // null means no custom evaluation

	// Resource operation hooks
	beforeResourceOperation?: (
		data: ResourceOperationHookData,
		context: RbacHookContext,
	) => Promise<void>;

	afterResourceOperation?: (
		data: ResourceOperationHookData & { success: boolean },
		context: RbacHookContext,
	) => Promise<void>;

	// Audit hooks
	beforeAuditLog?: (
		data: { auditData: Omit<RbacAuditLog, "id" | "timestamp"> },
		context: RbacHookContext,
	) => Promise<
		| void
		| {
				data: Omit<RbacAuditLog, "id" | "timestamp">;
		  }
	>;

	afterAuditLog?: (
		data: { auditLog: RbacAuditLog },
		context: RbacHookContext,
	) => Promise<void>;

	// Policy evaluation hooks
	beforePolicyEvaluation?: (
		data: {
			policies: RbacPolicy[];
			context: PermissionContext;
		},
		hookContext: RbacHookContext,
	) => Promise<
		| void
		| {
				policies: RbacPolicy[];
		  }
	>;

	afterPolicyEvaluation?: (
		data: {
			policies: RbacPolicy[];
			context: PermissionContext;
			result: boolean | null;
		},
		hookContext: RbacHookContext,
	) => Promise<void>;

	// Organization-specific hooks
	onOrganizationCreate?: (
		data: {
			organizationId: string;
			creatorId: string;
		},
		context: RbacHookContext,
	) => Promise<void>;

	onOrganizationDelete?: (
		data: {
			organizationId: string;
			deletedBy: string;
		},
		context: RbacHookContext,
	) => Promise<void>;

	onMemberJoin?: (
		data: {
			userId: string;
			organizationId: string;
			teamId?: string;
			invitedBy?: string;
		},
		context: RbacHookContext,
	) => Promise<void>;

	onMemberLeave?: (
		data: {
			userId: string;
			organizationId: string;
			teamId?: string;
			removedBy?: string;
		},
		context: RbacHookContext,
	) => Promise<void>;

	// Team-specific hooks
	onTeamCreate?: (
		data: {
			teamId: string;
			organizationId: string;
			creatorId: string;
		},
		context: RbacHookContext,
	) => Promise<void>;

	onTeamDelete?: (
		data: {
			teamId: string;
			organizationId: string;
			deletedBy: string;
		},
		context: RbacHookContext,
	) => Promise<void>;

	// Security hooks
	onUnauthorizedAccess?: (
		data: {
			userId: string;
			action: string;
			resource?: string;
			organizationId?: string;
			reason: string;
		},
		context: RbacHookContext,
	) => Promise<void>;

	onSuspiciousActivity?: (
		data: {
			userId: string;
			activity: string;
			details: Record<string, any>;
			organizationId?: string;
		},
		context: RbacHookContext,
	) => Promise<void>;

	// Bulk operation hooks
	onBulkRoleAssignment?: (
		data: {
			assignments: RoleAssignmentHookData[];
			assignedBy: string;
		},
		context: RbacHookContext,
	) => Promise<void>;

	onBulkPermissionUpdate?: (
		data: {
			roleId: string;
			permissionChanges: {
				added: string[];
				removed: string[];
			};
			updatedBy: string;
		},
		context: RbacHookContext,
	) => Promise<void>;
}

// Default implementations of common hooks
export const defaultRbacHooks: Partial<RbacHooks> = {
	// Auto-assign default role to new organization members
	async onMemberJoin(data, context) {
		// This would be implemented to assign a default "member" role
		console.log(`Member ${data.userId} joined organization ${data.organizationId}`);
	},

	// Log unauthorized access attempts
	async onUnauthorizedAccess(data, context) {
		console.warn(
			`Unauthorized access attempt by user ${data.userId} for action ${data.action} on resource ${data.resource}`,
		);
	},

	// Default audit logging
	async beforeAuditLog(data, context) {
		// Add default fields like IP address, user agent
		if (context.request) {
			const ipAddress = context.request.headers.get("x-forwarded-for") || 
				context.request.headers.get("x-real-ip") || 
				"unknown";
			const userAgent = context.request.headers.get("user-agent") || "unknown";

			return {
				data: {
					...data.auditData,
					ipAddress,
					userAgent,
				},
			};
		}
	},

	// Default role hierarchy setup for new organizations
	async onOrganizationCreate(data, context) {
		// This would create default roles for the organization
		console.log(`Setting up default roles for organization ${data.organizationId}`);
	},
};

// Hook utilities
export const createHookRunner = (hooks: RbacHooks) => {
	return {
		async runBeforeHook<T, R>(
			hookName: keyof RbacHooks,
			data: T,
			context: RbacHookContext,
		): Promise<R | void> {
			const hook = hooks[hookName] as any;
			if (hook) {
				return await hook(data, context);
			}
		},

		async runAfterHook<T>(
			hookName: keyof RbacHooks,
			data: T,
			context: RbacHookContext,
		): Promise<void> {
			const hook = hooks[hookName] as any;
			if (hook) {
				await hook(data, context);
			}
		},

		async runCustomEvaluator(
			data: PermissionCheckHookData,
			context: RbacHookContext,
		): Promise<boolean | null> {
			if (hooks.customPermissionEvaluator) {
				return await hooks.customPermissionEvaluator(data, context);
			}
			return null;
		},
	};
};

// Common hook implementations
export const createOrganizationSetupHook = (defaultRoles: string[]) => {
	return async (
		data: { organizationId: string; creatorId: string },
		context: RbacHookContext,
	) => {
		// Implementation would create default roles and assign creator as owner
		console.log(`Setting up organization ${data.organizationId} with roles:`, defaultRoles);
	};
};

export const createSecurityAuditHook = (sensitiveActions: string[]) => {
	return async (
		data: { auditData: Omit<RbacAuditLog, "id" | "timestamp"> },
		context: RbacHookContext,
	) => {
		if (sensitiveActions.includes(data.auditData.action)) {
			// Enhanced logging for sensitive actions
			console.log("Sensitive action detected:", data.auditData.action);
		}
	};
};
