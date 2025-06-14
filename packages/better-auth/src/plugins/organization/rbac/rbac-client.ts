import type { BetterAuthClientPlugin } from "../../../types";
import type { AccessControl, Role } from "../../access";
import type { RbacOrganizationOptions } from "./rbac-types";
import {
	type Role as RbacRole,
	type Permission,
	type UserRole,
	type AuditLog,
	SYSTEM_PERMISSIONS,
} from "./rbac-schema";

interface RbacClientOptions {
	ac?: AccessControl;
	roles?: {
		[key in string]: Role;
	};
}

/**
 * RBAC client plugin for organization with database-level access control
 * 
 * Provides client-side methods for managing roles, permissions, and access control
 */
export const organizationRbacClient = <O extends RbacClientOptions>(
	options?: O,
) => {
	return {
		id: "organization-rbac-client",
		
		$InferServerPlugin: {} as any,

		getActions: ($fetch) => ({
			rbac: {
				// Role Management
				roles: {
					/**
					 * Create a new role
					 */
					create: async (data: {
						name: string;
						description?: string;
						organizationId?: string;
						level?: number;
						parentRoleId?: string;
						permissions?: string[];
						fetchOptions?: any;
					}) => {
						const { fetchOptions, ...body } = data;
						return await $fetch("/organization/rbac/roles/create", {
							method: "POST",
							body,
							...fetchOptions,
						});
					},

					/**
					 * List roles in an organization
					 */
					list: async (params?: {
						organizationId?: string;
						includePermissions?: boolean;
						fetchOptions?: any;
					}) => {
						const { fetchOptions, ...query } = params || {};
						return await $fetch("/organization/rbac/roles/list", {
							method: "GET",
							query,
							...fetchOptions,
						});
					},

					/**
					 * Update a role
					 */
					update: async (data: {
						roleId: string;
						name?: string;
						description?: string;
						level?: number;
						permissions?: string[];
						fetchOptions?: any;
					}) => {
						const { fetchOptions, ...body } = data;
						return await $fetch("/organization/rbac/roles/update", {
							method: "PUT",
							body,
							...fetchOptions,
						});
					},

					/**
					 * Delete a role
					 */
					delete: async (data: { roleId: string }) => {
						return await $fetch("/organization/rbac/roles/delete", {
							method: "DELETE",
							body: data,
						});
					},
				},

				// User Role Management
				users: {
					/**
					 * Assign a role to a user
					 */
					assignRole: async (data: {
						userId: string;
						roleId: string;
						organizationId?: string;
						teamId?: string;
						expiresAt?: string;
						fetchOptions?: any;
					}) => {
						const { fetchOptions, ...body } = data;
						return await $fetch("/organization/rbac/users/assign-role", {
							method: "POST",
							body,
							...fetchOptions,
						});
					},

					/**
					 * Remove a role from a user
					 */
					removeRole: async (data: {
						userId: string;
						roleId: string;
						organizationId?: string;
						fetchOptions?: any;
					}) => {
						const { fetchOptions, ...body } = data;
						return await $fetch("/organization/rbac/users/remove-role", {
							method: "DELETE",
							body,
							...fetchOptions,
						});
					},

					/**
					 * Get roles assigned to a user
					 */
					getRoles: async (params: {
						userId: string;
						organizationId?: string;
						fetchOptions?: any;
					}) => {
						const { fetchOptions, ...query } = params;
						return await $fetch("/organization/rbac/users/roles", {
							method: "GET",
							query,
							...fetchOptions,
						});
					},
				},

				// Permission Management
				permissions: {
					/**
					 * List available permissions
					 */
					list: async (params?: {
						organizationId?: string;
						resource?: string;
						fetchOptions?: any;
					}) => {
						const { fetchOptions, ...query } = params || {};
						return await $fetch("/organization/rbac/permissions/list", {
							method: "GET",
							query,
							...fetchOptions,
						});
					},

					/**
					 * Check if a user has a specific permission
					 */
					check: async (data: {
						userId?: string;
						permission?: string;
						action?: string;
						resource?: string;
						resourceId?: string;
						organizationId?: string;
						teamId?: string;
						context?: Record<string, any>;
						fetchOptions?: any;
					}) => {
						const { fetchOptions, ...body } = data;
						return await $fetch("/organization/rbac/check-permission", {
							method: "POST",
							body: {
								...body,
								action: body.permission || body.action, // Support both permission and action parameters
							},
							...fetchOptions,
						});
					},
				},

				// Audit Logs
				auditLogs: {
					/**
					 * Get audit logs for RBAC operations
					 */
					get: async (params?: {
						organizationId?: string;
						limit?: number;
						action?: string;
						userId?: string;
						fetchOptions?: any;
					}) => {
						const { fetchOptions, ...query } = params || {};
						return await $fetch("/organization/rbac/audit-logs", {
							method: "GET",
							query,
							...fetchOptions,
						});
					},

					/**
					 * List audit logs for RBAC operations (alias for get)
					 */
					list: async (params?: {
						organizationId?: string;
						limit?: number;
						action?: string;
						userId?: string;
						fetchOptions?: any;
					}) => {
						const { fetchOptions, ...query } = params || {};
						return await $fetch("/organization/rbac/audit-logs", {
							method: "GET",
							query,
							...fetchOptions,
						});
					},
				},

				// User Roles (alias for users.getRoles for backward compatibility)
				userRoles: {
					/**
					 * Get roles assigned to a user (alias for users.getRoles)
					 */
					list: async (params: {
						userId?: string;
						organizationId?: string;
						fetchOptions?: any;
					}) => {
						const { fetchOptions, ...query } = params;
						// If userId is not provided, let the server use the current user
						const queryParams = params.userId ? query : { organizationId: params.organizationId };
						return await $fetch("/organization/rbac/users/roles", {
							method: "GET",
							query: queryParams,
							...fetchOptions,
						});
					},
				},
			},
		}),

		// React hooks for RBAC
		atomListeners: [
			{
				matcher: (path: string) => path.startsWith("/organization/rbac/"),
				signal: "rbac",
			},
		],
	} satisfies BetterAuthClientPlugin;
};

// Utility functions (can be used separately)
export const rbacUtils = {
	/**
	 * Check if user has permission for an action on a resource
	 */
	hasPermission: async (
		$fetch: any,
		data: {
			action: string;
			resource?: string;
			resourceId?: string;
			organizationId?: string;
			context?: Record<string, any>;
		},
	) => {
		try {
			const result = await $fetch("/organization/rbac/check-permission", {
				method: "POST",
				body: data,
			});
			return result.hasPermission || false;
		} catch (error) {
			console.error("Permission check failed:", error);
			return false;
		}
	},

	/**
	 * Get user's effective permissions in an organization
	 */
	getEffectivePermissions: async (
		$fetch: any,
		params: {
			userId: string;
			organizationId?: string;
		},
	) => {
		try {
			const rolesResult = await $fetch("/organization/rbac/users/roles", {
				method: "GET",
				query: params,
			});

			const permissions = new Set<string>();
			
			// Get permissions for each role
			for (const userRole of rolesResult.roles) {
				const roleResult = await $fetch("/organization/rbac/roles/list", {
					method: "GET",
					query: {
						organizationId: params.organizationId,
						includePermissions: true,
					},
				});

				const role = roleResult.roles.find((r: any) => r.id === userRole.roleId);
				if (role?.permissions) {
					role.permissions.forEach((p: any) => {
						if (p.granted) {
							permissions.add(p.name);
						}
					});
				}
			}

			return Array.from(permissions);
		} catch (error) {
			console.error("Failed to get effective permissions:", error);
			return [];
		}
	},

	/**
	 * Check if user has any of the specified roles
	 */
	hasAnyRole: async (
		$fetch: any,
		data: {
			userId: string;
			roleNames: string[];
			organizationId?: string;
		},
	) => {
		try {
			const rolesResult = await $fetch("/organization/rbac/users/roles", {
				method: "GET",
				query: {
					userId: data.userId,
					organizationId: data.organizationId,
				},
			});

			// Get role details to check names
			const rolesList = await $fetch("/organization/rbac/roles/list", {
				method: "GET",
				query: {
					organizationId: data.organizationId,
				},
			});

			const userRoleIds = rolesResult.roles.map((ur: any) => ur.roleId);
			const userRoleNames = rolesList.roles
				.filter((r: any) => userRoleIds.includes(r.id))
				.map((r: any) => r.name);

			return data.roleNames.some((roleName) =>
				userRoleNames.includes(roleName),
			);
		} catch (error) {
			console.error("Role check failed:", error);
			return false;
		}
	},

	/**
	 * Get system permissions constants
	 */
	getSystemPermissions: () => SYSTEM_PERMISSIONS,
};

// Type exports for client
export type RbacClientActions = ReturnType<
	typeof organizationRbacClient
>["getActions"];
