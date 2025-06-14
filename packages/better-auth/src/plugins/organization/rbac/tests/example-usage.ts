import { betterAuth } from "../../../../auth";
import { organizationRbac } from "../rbac-organization";
import type { RbacHookContext, PermissionCheckHookData } from "../rbac-hooks";

/**
 * Example: Setting up Better Auth with RBAC Organization Plugin
 *
 * This example demonstrates how to configure and use the RBAC
 * organization plugin for database-level role-based access control.
 */

// Server-side configuration
export const auth = betterAuth({
	database: undefined, // Configure your database here
	baseURL: "http://localhost:3000",

	plugins: [
		organizationRbac({
			// Standard organization plugin options
			allowUserToCreateOrganization: true,
			organizationLimit: 5,

			// RBAC-specific configuration
			rbac: {
				enabled: true,
				enableAuditLog: true,
				enablePolicyEngine: true,
				cacheTTL: 300, // 5 minutes

				// Custom roles for your application
				defaultRoles: [
					{
						name: "Project Manager",
						level: 5,
						permissions: [
							"project:create",
							"project:update",
							"project:read",
							"project:delete",
							"team:manage",
						],
						isCreatorRole: false,
					},
					{
						name: "Developer",
						level: 3,
						permissions: [
							"project:read",
							"task:create",
							"task:update",
							"task:read",
						],
						isCreatorRole: false,
					},
					{
						name: "Viewer",
						level: 1,
						permissions: ["project:read", "task:read"],
						isCreatorRole: false,
					},
				],

				// Custom permissions for your domain
				customPermissions: [
					{
						name: "project:create",
						resource: "project",
						action: "create",
						description: "Create new projects",
					},
					{
						name: "project:update",
						resource: "project",
						action: "update",
						description: "Update existing projects",
					},
					{
						name: "project:read",
						resource: "project",
						action: "read",
						description: "Read project information",
					},
					{
						name: "project:delete",
						resource: "project",
						action: "delete",
						description: "Delete projects",
					},
					{
						name: "task:create",
						resource: "task",
						action: "create",
						description: "Create new tasks",
					},
					{
						name: "task:update",
						resource: "task",
						action: "update",
						description: "Update existing tasks",
					},
					{
						name: "task:read",
						resource: "task",
						action: "read",
						description: "Read task information",
					},
					{
						name: "team:manage",
						resource: "team",
						action: "manage",
						description: "Manage team members and settings",
					},
				],

				// Custom hooks for business logic
				hooks: {
					// Auto-assign role when user joins organization
					onMemberJoin: async (
						data: {
							userId: string;
							organizationId: string;
							teamId?: string;
							invitedBy?: string;
						},
						context: RbacHookContext,
					) => {
						console.log(
							`Member ${data.userId} joined organization ${data.organizationId}`,
						);

						// Auto-assign "Viewer" role to new members
						const rbacAdapter = (context.context as any).rbacAdapter;
						if (rbacAdapter) {
							const viewerRole = await rbacAdapter.findRoleByName(
								"Viewer",
								data.organizationId,
							);
							if (viewerRole) {
								await rbacAdapter.assignRoleToUser({
									userId: data.userId,
									roleId: viewerRole.id,
									organizationId: data.organizationId,
									assignedBy: data.invitedBy || data.userId,
								});
							}
						}
					},

					// Log unauthorized access attempts
					onUnauthorizedAccess: async (
						data: PermissionCheckHookData,
						context: RbacHookContext,
					) => {
						console.warn(
							`Unauthorized access attempt: User ${data.userId} tried ${data.action} on ${data.resource}`,
						);

						// Could integrate with monitoring/alerting systems here
					},

					// Organization-specific setup
					onOrganizationCreate: async (
						data: { organizationId: string; creatorId: string },
						context: RbacHookContext,
					) => {
						console.log(
							`Setting up RBAC for organization ${data.organizationId}`,
						);

						// Custom organization setup logic can go here
						// The plugin already handles creating default roles and permissions
					},
				},
			},

			// Organization creation hooks
			organizationCreation: {
				beforeCreate: async ({ organization, user }: any) => {
					// Custom validation or modification before org creation
					return {
						data: {
							...organization,
							metadata: {
								...organization.metadata,
								createdBy: user.name,
								rbacEnabled: true,
							},
						},
					};
				},

				afterCreate: async ({ organization, member, user }: any) => {
					console.log(
						`Organization ${organization.name} created with RBAC enabled`,
					);
					// Additional setup after organization creation
				},
			},
		}),
	],
});

// Example client usage would go in your frontend code
/*
import { createAuthClient } from "better-auth/client";
import { organizationRbacClient } from "better-auth/client/plugins";

export const client = createAuthClient({
  baseURL: "http://localhost:3000/api/auth",
  plugins: [organizationRbacClient()]
});

// Usage examples:
// await client.organization.create({ name: "My Org", slug: "my-org" });
// await client.rbac.roles.list({ organizationId: "org-id" });
// await client.rbac.permissions.check({ permission: "project:create", organizationId: "org-id" });
*/
