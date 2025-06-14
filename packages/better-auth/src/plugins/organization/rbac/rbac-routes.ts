import { APIError } from "../../../api";
import { z } from "zod";
import { createAuthEndpoint } from "../../../api/call";
import { getRbacAdapter } from "./rbac-adapter";
import type { RbacOrganizationOptions } from "./rbac-types";
import { orgSessionMiddleware } from "../call";

/**
 * RBAC routes for managing roles, permissions, and access control
 */
export const rbacRoutes = <O extends RbacOrganizationOptions>(options?: O) => {
	return {
		// Role Management Routes
		createRole: createAuthEndpoint(
			"/organization/rbac/roles/create",
			{
				method: "POST",
				use: [orgSessionMiddleware],
				body: z.object({
					name: z.string(),
					description: z.string().optional(),
					organizationId: z.string().optional(),
					level: z.number().default(0),
					parentRoleId: z.string().optional(),
					permissions: z.array(z.string()).optional(),
				}),
				metadata: {
					openapi: {
						description: "Create a new role",
						responses: {
							"200": {
								description: "Role created successfully",
								content: {
									"application/json": {
										schema: {
											type: "object",
											properties: {
												role: {
													$ref: "#/components/schemas/Role",
												},
											},
										},
									},
								},
							},
						},
					},
				},
			},
			async (ctx) => {
				const session = ctx.context.session;
				if (!session) {
					throw new APIError("UNAUTHORIZED");
				}

				// Create adapter on-demand
				const rbacAdapter = getRbacAdapter(ctx.context);
				if (!rbacAdapter) {
					throw new APIError("BAD_REQUEST", {
						message: "RBAC not enabled",
					});
				}

				const organizationId =
					ctx.body.organizationId || session.session.activeOrganizationId;
				if (!organizationId) {
					throw new APIError("BAD_REQUEST", {
						message: "Organization ID required",
					});
				}

				// Check permission to create roles
				const hasPermission = await rbacAdapter.checkUserPermission(
					session.user.id,
					"role:create",
					organizationId,
					{
						userId: session.user.id,
						organizationId,
						action: "role:create",
						resourceType: "role",
						conditions: {
							ipAddress:
								ctx.request?.headers?.get("x-forwarded-for") || "unknown",
							userAgent: ctx.request?.headers?.get("user-agent") || "unknown",
						},
					},
				);

				if (!hasPermission) {
					throw new APIError("FORBIDDEN", {
						message: "Insufficient permissions to create roles",
					});
				}

				// Create the role
				const role = await rbacAdapter.createRole({
					name: ctx.body.name,
					description: ctx.body.description,
					organizationId,
					level: ctx.body.level,
					parentRoleId: ctx.body.parentRoleId,
				});

				// Assign permissions if provided
				if (ctx.body.permissions) {
					for (const permissionName of ctx.body.permissions) {
						const permission =
							await rbacAdapter.findPermissionByName(permissionName);
						if (permission) {
							await rbacAdapter.assignPermissionToRole({
								roleId: role.id,
								permissionId: permission.id,
								granted: true,
							});
						}
					}
				}

				// Create audit log
				await rbacAdapter.createAuditLog({
					action: "ROLE_CREATED",
					resource: "role",
					resourceId: role.id,
					userId: session.user.id,
					organizationId,
					details: JSON.stringify({
						roleName: role.name,
						permissions: ctx.body.permissions || [],
					}),
				});

				return ctx.json({ role });
			},
		),

		listRoles: createAuthEndpoint(
			"/organization/rbac/roles/list",
			{
				method: "GET",
				use: [orgSessionMiddleware],
				query: z.object({
					organizationId: z.string().optional(),
					includePermissions: z.boolean().default(false),
				}),
				metadata: {
					openapi: {
						description: "List roles in an organization",
						responses: {
							"200": {
								description: "Roles retrieved successfully",
								content: {
									"application/json": {
										schema: {
											type: "object",
											properties: {
												roles: {
													type: "array",
													items: {
														$ref: "#/components/schemas/Role",
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
			},
			async (ctx) => {
				const session = ctx.context.session;
				if (!session) {
					throw new APIError("UNAUTHORIZED");
				}

				const rbacAdapter = getRbacAdapter(ctx.context);
				if (!rbacAdapter) {
					throw new APIError("BAD_REQUEST", {
						message: "RBAC not enabled",
					});
				}

				const organizationId =
					ctx.query.organizationId || session.session.activeOrganizationId;
				if (!organizationId) {
					throw new APIError("BAD_REQUEST", {
						message: "Organization ID required",
					});
				}

				// Get roles for the organization
				const roles = await rbacAdapter.findRolesByOrganization(organizationId);

				// Include permissions if requested
				if (ctx.query.includePermissions) {
					const rolesWithPermissions = await Promise.all(
						roles.map(async (role: any) => {
							const rolePermissions = await rbacAdapter.getRolePermissions(
								role.id,
							);
							const permissions = await Promise.all(
								rolePermissions.map(async (rp: any) => {
									return await rbacAdapter.findPermissionById(rp.permissionId);
								}),
							);
							return { ...role, permissions: permissions.filter(Boolean) };
						}),
					);
					return ctx.json({ roles: rolesWithPermissions });
				}

				return ctx.json({ roles });
			},
		),

		updateRole: createAuthEndpoint(
			"/organization/rbac/roles/update",
			{
				method: "PATCH",
				use: [orgSessionMiddleware],
				body: z.object({
					roleId: z.string(),
					name: z.string().optional(),
					description: z.string().optional(),
					level: z.number().optional(),
					parentRoleId: z.string().optional(),
				}),
				metadata: {
					openapi: {
						description: "Update a role",
						responses: {
							"200": {
								description: "Role updated successfully",
								content: {
									"application/json": {
										schema: {
											type: "object",
											properties: {
												role: {
													$ref: "#/components/schemas/Role",
												},
											},
										},
									},
								},
							},
						},
					},
				},
			},
			async (ctx) => {
				const session = ctx.context.session;
				if (!session) {
					throw new APIError("UNAUTHORIZED");
				}

				const rbacAdapter = getRbacAdapter(ctx.context);
				if (!rbacAdapter) {
					throw new APIError("BAD_REQUEST", {
						message: "RBAC not enabled",
					});
				}

				// Get the role to ensure it exists and get organizationId
				const existingRole = await rbacAdapter.findRoleById(ctx.body.roleId);
				if (!existingRole) {
					throw new APIError("NOT_FOUND", {
						message: "Role not found",
					});
				}

				// Check permission to update roles
				const hasPermission = await rbacAdapter.checkUserPermission(
					session.user.id,
					"role:update",
					existingRole.organizationId,
					{
						userId: session.user.id,
						organizationId: existingRole.organizationId,
						action: "role:update",
						resourceType: "role",
						resourceId: ctx.body.roleId,
					},
				);

				if (!hasPermission) {
					throw new APIError("FORBIDDEN", {
						message: "Insufficient permissions to update roles",
					});
				}

				// Update the role
				const role = await rbacAdapter.updateRole(ctx.body.roleId, {
					name: ctx.body.name,
					description: ctx.body.description,
					level: ctx.body.level,
					parentRoleId: ctx.body.parentRoleId,
				});

				// Create audit log
				await rbacAdapter.createAuditLog({
					action: "ROLE_UPDATED",
					resource: "role",
					resourceId: role.id,
					userId: session.user.id,
					organizationId: existingRole.organizationId,
					details: JSON.stringify({
						roleName: role.name,
						changes: ctx.body,
					}),
				});

				return ctx.json({ role });
			},
		),

		deleteRole: createAuthEndpoint(
			"/organization/rbac/roles/delete",
			{
				method: "DELETE",
				use: [orgSessionMiddleware],
				body: z.object({
					roleId: z.string(),
				}),
				metadata: {
					openapi: {
						description: "Delete a role",
						responses: {
							"200": {
								description: "Role deleted successfully",
								content: {
									"application/json": {
										schema: {
											type: "object",
											properties: {
												success: {
													type: "boolean",
												},
											},
										},
									},
								},
							},
						},
					},
				},
			},
			async (ctx) => {
				const session = ctx.context.session;
				if (!session) {
					throw new APIError("UNAUTHORIZED");
				}

				const rbacAdapter = getRbacAdapter(ctx.context);
				if (!rbacAdapter) {
					throw new APIError("BAD_REQUEST", {
						message: "RBAC not enabled",
					});
				}

				// Get the role to ensure it exists and get organizationId
				const existingRole = await rbacAdapter.findRoleById(ctx.body.roleId);
				if (!existingRole) {
					throw new APIError("NOT_FOUND", {
						message: "Role not found",
					});
				}

				// Check permission to delete roles
				const hasPermission = await rbacAdapter.checkUserPermission(
					session.user.id,
					"role:delete",
					existingRole.organizationId,
					{
						userId: session.user.id,
						organizationId: existingRole.organizationId,
						action: "role:delete",
						resourceType: "role",
						resourceId: ctx.body.roleId,
					},
				);

				if (!hasPermission) {
					throw new APIError("FORBIDDEN", {
						message: "Insufficient permissions to delete roles",
					});
				}

				// Delete the role
				await rbacAdapter.deleteRole(ctx.body.roleId);

				// Create audit log
				await rbacAdapter.createAuditLog({
					action: "ROLE_DELETED",
					resource: "role",
					resourceId: ctx.body.roleId,
					userId: session.user.id,
					organizationId: existingRole.organizationId,
					details: JSON.stringify({
						roleName: existingRole.name,
					}),
				});

				return ctx.json({ success: true });
			},
		),

		// User Role Assignment Routes
		assignRoleToUser: createAuthEndpoint(
			"/organization/rbac/users/assign-role",
			{
				method: "POST",
				use: [orgSessionMiddleware],
				body: z.object({
					userId: z.string(),
					roleId: z.string(),
					organizationId: z.string().optional(),
				}),
				metadata: {
					openapi: {
						description: "Assign a role to a user",
						responses: {
							"200": {
								description: "Role assigned successfully",
								content: {
									"application/json": {
										schema: {
											type: "object",
											properties: {
												memberRole: {
													$ref: "#/components/schemas/RbacMemberRole",
												},
											},
										},
									},
								},
							},
						},
					},
				},
			},
			async (ctx) => {
				const session = ctx.context.session;
				if (!session) {
					throw new APIError("UNAUTHORIZED");
				}

				const rbacAdapter = getRbacAdapter(ctx.context);
				if (!rbacAdapter) {
					throw new APIError("BAD_REQUEST", {
						message: "RBAC not enabled",
					});
				}

				const organizationId =
					ctx.body.organizationId || session.session.activeOrganizationId;
				if (!organizationId) {
					throw new APIError("BAD_REQUEST", {
						message: "Organization ID required",
					});
				}

				// Check permission to assign roles
				const hasPermission = await rbacAdapter.checkUserPermission(
					session.user.id,
					"role:assign",
					organizationId,
					{
						userId: session.user.id,
						organizationId,
						action: "role:assign",
						resourceType: "role",
						resourceId: ctx.body.roleId,
					},
				);

				if (!hasPermission) {
					throw new APIError("FORBIDDEN", {
						message: "Insufficient permissions to assign roles",
					});
				}

				// Assign the role to the user
				const memberRole = await rbacAdapter.assignRoleToUser({
					userId: ctx.body.userId,
					roleId: ctx.body.roleId,
					organizationId,
					assignedBy: session.user.id,
				});

				// Create audit log
				await rbacAdapter.createAuditLog({
					action: "ROLE_ASSIGNED",
					resource: "user_role",
					resourceId: memberRole.id,
					userId: session.user.id,
					organizationId,
					details: JSON.stringify({
						targetUserId: ctx.body.userId,
						roleId: ctx.body.roleId,
					}),
				});

				return ctx.json({ memberRole });
			},
		),

		removeRoleFromUser: createAuthEndpoint(
			"/organization/rbac/users/remove-role",
			{
				method: "DELETE",
				use: [orgSessionMiddleware],
				body: z.object({
					userId: z.string(),
					roleId: z.string(),
					organizationId: z.string().optional(),
				}),
				metadata: {
					openapi: {
						description: "Remove a role from a user",
						responses: {
							"200": {
								description: "Role removed successfully",
								content: {
									"application/json": {
										schema: {
											type: "object",
											properties: {
												success: {
													type: "boolean",
												},
											},
										},
									},
								},
							},
						},
					},
				},
			},
			async (ctx) => {
				const session = ctx.context.session;
				if (!session) {
					throw new APIError("UNAUTHORIZED");
				}

				const rbacAdapter = getRbacAdapter(ctx.context);
				if (!rbacAdapter) {
					throw new APIError("BAD_REQUEST", {
						message: "RBAC not enabled",
					});
				}

				const organizationId =
					ctx.body.organizationId || session.session.activeOrganizationId;
				if (!organizationId) {
					throw new APIError("BAD_REQUEST", {
						message: "Organization ID required",
					});
				}

				// Check permission to remove roles
				const hasPermission = await rbacAdapter.checkUserPermission(
					session.user.id,
					"role:remove",
					organizationId,
					{
						userId: session.user.id,
						organizationId,
						action: "role:remove",
						resourceType: "role",
						resourceId: ctx.body.roleId,
					},
				);

				if (!hasPermission) {
					throw new APIError("FORBIDDEN", {
						message: "Insufficient permissions to remove roles",
					});
				}

				// Remove the role from the user
				await rbacAdapter.removeRoleFromUser(
					ctx.body.userId,
					ctx.body.roleId,
					organizationId,
					session.user.id,
				);

				// Create audit log
				await rbacAdapter.createAuditLog({
					action: "ROLE_REMOVED",
					resource: "user_role",
					resourceId: `${ctx.body.userId}-${ctx.body.roleId}`,
					userId: session.user.id,
					organizationId,
					details: JSON.stringify({
						targetUserId: ctx.body.userId,
						roleId: ctx.body.roleId,
					}),
				});

				return ctx.json({ success: true });
			},
		),

		getUserRoles: createAuthEndpoint(
			"/organization/rbac/users/roles",
			{
				method: "GET",
				use: [orgSessionMiddleware],
				query: z.object({
					userId: z.string().optional(),
					organizationId: z.string().optional(),
				}),
				metadata: {
					openapi: {
						description: "Get roles for a user",
						responses: {
							"200": {
								description: "User roles retrieved successfully",
								content: {
									"application/json": {
										schema: {
											type: "object",
											properties: {
												roles: {
													type: "array",
													items: {
														$ref: "#/components/schemas/Role",
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
			},
			async (ctx) => {
				const session = ctx.context.session;
				if (!session) {
					throw new APIError("UNAUTHORIZED");
				}

				const rbacAdapter = getRbacAdapter(ctx.context);
				if (!rbacAdapter) {
					throw new APIError("BAD_REQUEST", {
						message: "RBAC not enabled",
					});
				}

				const userId = ctx.query.userId || session.user.id;
				const organizationId =
					ctx.query.organizationId || session.session.activeOrganizationId;

				if (!organizationId) {
					throw new APIError("BAD_REQUEST", {
						message: "Organization ID required",
					});
				}

				// Get user roles
				const memberRoles = await rbacAdapter.getUserRoles(
					userId,
					organizationId,
				);

				// Get full role details
				const roles = await Promise.all(
					memberRoles.map(async (memberRole: any) => {
						return await rbacAdapter.findRoleById(memberRole.roleId);
					}),
				);

				return ctx.json({ roles: roles.filter(Boolean) });
			},
		),

		// Permission Routes
		listPermissions: createAuthEndpoint(
			"/organization/rbac/permissions/list",
			{
				method: "GET",
				use: [orgSessionMiddleware],
				query: z.object({
					resource: z.string().optional(),
				}),
				metadata: {
					openapi: {
						description: "List available permissions",
						responses: {
							"200": {
								description: "Permissions retrieved successfully",
								content: {
									"application/json": {
										schema: {
											type: "object",
											properties: {
												permissions: {
													type: "array",
													items: {
														$ref: "#/components/schemas/RbacPermission",
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
			},
			async (ctx) => {
				const session = ctx.context.session;
				if (!session) {
					throw new APIError("UNAUTHORIZED");
				}

				const rbacAdapter = getRbacAdapter(ctx.context);
				if (!rbacAdapter) {
					throw new APIError("BAD_REQUEST", {
						message: "RBAC not enabled",
					});
				}

				// Get all permissions
				const permissions = await rbacAdapter.listPermissions();

				// Filter by resource if specified
				const filteredPermissions = ctx.query.resource
					? permissions.filter((p: any) => p.resource === ctx.query.resource)
					: permissions;

				return ctx.json({ permissions: filteredPermissions });
			},
		),

		checkPermission: createAuthEndpoint(
			"/organization/rbac/permissions/check",
			{
				method: "POST",
				use: [orgSessionMiddleware],
				body: z.object({
					userId: z.string().optional(),
					organizationId: z.string().optional(),
					permission: z.string().optional(),
					action: z.string().optional(),
					resourceType: z.string().optional(),
					resourceId: z.string().optional(),
				}),
				metadata: {
					openapi: {
						description: "Check if a user has a specific permission",
						responses: {
							"200": {
								description: "Permission check result",
								content: {
									"application/json": {
										schema: {
											type: "object",
											properties: {
												hasPermission: {
													type: "boolean",
												},
											},
										},
									},
								},
							},
						},
					},
				},
			},
			async (ctx) => {
				const session = ctx.context.session;
				if (!session) {
					throw new APIError("UNAUTHORIZED");
				}

				const rbacAdapter = getRbacAdapter(ctx.context);
				if (!rbacAdapter) {
					throw new APIError("BAD_REQUEST", {
						message: "RBAC not enabled",
					});
				}

				const userId = ctx.body.userId || session.user.id;
				const organizationId =
					ctx.body.organizationId || session.session.activeOrganizationId;

				if (!organizationId) {
					throw new APIError("BAD_REQUEST", {
						message: "Organization ID required",
					});
				}

				let hasPermission = false;

				if (ctx.body.permission) {
					// Check by permission name - get effective permissions and check if it includes the requested permission
					const effectivePermissions =
						await rbacAdapter.getEffectivePermissions(userId, organizationId);
					hasPermission = effectivePermissions.includes(ctx.body.permission);
				} else if (ctx.body.action && ctx.body.resourceType) {
					// Check by action and resource type
					hasPermission = await rbacAdapter.evaluatePermission({
						userId,
						organizationId,
						action: ctx.body.action,
						resourceType: ctx.body.resourceType,
						resourceId: ctx.body.resourceId,
					});
				} else {
					throw new APIError("BAD_REQUEST", {
						message:
							"Either permission or action+resourceType must be provided",
					});
				}

				return ctx.json({ hasPermission });
			},
		),

		// Audit Log Routes
		getAuditLogs: createAuthEndpoint(
			"/organization/rbac/audit/logs",
			{
				method: "GET",
				use: [orgSessionMiddleware],
				query: z.object({
					organizationId: z.string().optional(),
					userId: z.string().optional(),
					action: z.string().optional(),
					resource: z.string().optional(),
					limit: z.number().default(50),
					offset: z.number().default(0),
				}),
				metadata: {
					openapi: {
						description: "Get audit logs",
						responses: {
							"200": {
								description: "Audit logs retrieved successfully",
								content: {
									"application/json": {
										schema: {
											type: "object",
											properties: {
												logs: {
													type: "array",
													items: {
														type: "object",
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
			},
			async (ctx) => {
				const session = ctx.context.session;
				if (!session) {
					throw new APIError("UNAUTHORIZED");
				}

				const rbacAdapter = getRbacAdapter(ctx.context);
				if (!rbacAdapter) {
					throw new APIError("BAD_REQUEST", {
						message: "RBAC not enabled",
					});
				}

				const organizationId =
					ctx.query.organizationId || session.session.activeOrganizationId;
				if (!organizationId) {
					throw new APIError("BAD_REQUEST", {
						message: "Organization ID required",
					});
				}

				// Check permission to read audit logs
				const hasPermission = await rbacAdapter.checkUserPermission(
					session.user.id,
					"audit:read",
					organizationId,
					{
						userId: session.user.id,
						organizationId,
						action: "audit:read",
						resourceType: "audit",
					},
				);

				if (!hasPermission) {
					throw new APIError("FORBIDDEN", {
						message: "Insufficient permissions to access audit logs",
					});
				}

				// Get audit logs
				const logs = await rbacAdapter.getAuditLogs(
					organizationId,
					ctx.query.limit,
					ctx.query.offset,
					{
						userId: ctx.query.userId,
						action: ctx.query.action,
						resource: ctx.query.resource,
					},
				);

				return ctx.json({ logs });
			},
		),
	};
};
