import type { AuthContext } from "../../../init";
import type { BetterAuthPlugin } from "../../../types/plugins";
import { organization } from "../organization";
import { getRbacAdapter } from "./rbac-adapter";
import type { RbacOrganizationOptions } from "./rbac-types";
import { rbacRoutes } from "./rbac-routes";
import { schema } from "./rbac-schema";
import { SYSTEM_PERMISSIONS } from "./rbac-schema";

/**
 * Extended Organization plugin with full database-level RBAC support
 *
 * This plugin extends the base organization plugin with comprehensive
 * Role-Based Access Control (RBAC) capabilities stored in the database.
 *
 * Features:
 * - Database-level roles and permissions
 * - Role hierarchy support
 * - Resource-level permissions
 * - Audit logging
 * - Policy engine for complex permission rules
 * - Hook system for customization
 *
 * @example
 * ```ts
 * const auth = betterAuth({
 *   plugins: [
 *     organizationRbac({
 *       rbac: {
 *         enabled: true,
 *         enableAuditLog: true,
 *         enablePolicyEngine: true,
 *         defaultRoles: [
 *           {
 *             name: "Project Manager",
 *             level: 2,
 *             permissions: ["project:create", "project:update", "project:delete"],
 *             isCreatorRole: false
 *           }
 *         ],
 *         customPermissions: [
 *           {
 *             name: "project:create",
 *             resource: "project",
 *             action: "create",
 *             description: "Create new projects"
 *           }
 *         ]
 *       }
 *     })
 *   ]
 * });
 * ```
 */
export const organizationRbac = <O extends RbacOrganizationOptions>(
	options?: O,
) => {
	// Get the base organization plugin
	const baseOrganizationPlugin = organization(options);

	// Create the RBAC extension
	const rbacExtension: BetterAuthPlugin = {
		id: "organization-rbac",

		init(ctx: AuthContext) {
			// Initialize RBAC adapter
			const rbacAdapter = getRbacAdapter(ctx, {
				enableAuditLog: options?.rbac?.enableAuditLog ?? true,
				enablePolicyEngine: options?.rbac?.enablePolicyEngine ?? false,
				cacheTTL: options?.rbac?.cacheTTL ?? 300,
			});

			// Store RBAC adapter in context for use by routes
			(ctx as any).rbacAdapter = rbacAdapter;
			(ctx as any).rbacOptions = options?.rbac;

			return {
				context: ctx,
			};
		},

		schema: {
			...schema,
		},

		endpoints: {
			...rbacRoutes<O>(options),
		},

		hooks: {
			after: [
				{
					matcher(context) {
						return context.path === "/organization/create";
					},
					handler: async (context) => {
						// Auto-setup RBAC for new organizations
						console.log("DEBUG: RBAC organization create hook triggered");
						console.log(
							"DEBUG: options?.rbac?.enabled:",
							options?.rbac?.enabled,
						);
						console.log(
							"DEBUG: context.context.returned:",
							!!(context as any).context.returned,
						);

						try {
							if (options?.rbac?.enabled && (context as any).context.returned) {
								const returned = (context as any).context.returned;
								console.log(
									"DEBUG: returned data:",
									JSON.stringify(returned, null, 2),
								);

								// The organization create endpoint returns: { ...organization, metadata, members: [member] }
								// So we need to extract the organization and member from this structure
								if (
									returned &&
									typeof returned === "object" &&
									"id" in returned &&
									"members" in returned
								) {
									const organization = returned;
									const member = returned.members?.[0]; // First member is the creator

									if (member) {
										console.log(
											"DEBUG: Setting up RBAC for organization:",
											organization.id,
										);
										await setupOrganizationRbac(
											(context as any).context,
											organization,
											member,
											options,
										);
										console.log("DEBUG: RBAC setup completed");
									} else {
										console.log("DEBUG: No member found in returned data");
									}
								} else {
									console.log(
										"DEBUG: Organization data not found in returned data",
									);
								}
							} else {
								console.log("DEBUG: RBAC not enabled or no returned data");
							}
						} catch (error) {
							console.error("DEBUG: RBAC setup failed:", error);
							// Don't break organization creation if RBAC setup fails
						}
						// Return empty response to not interfere with the original response
						return {};
					},
				},
			],
		},
	};

	// Merge the base organization plugin with RBAC extension
	return {
		...baseOrganizationPlugin,
		id: "organization-rbac",

		schema: {
			...baseOrganizationPlugin.schema,
			...rbacExtension.schema,
		},

		endpoints: {
			...baseOrganizationPlugin.endpoints,
			...rbacExtension.endpoints,
		},

		hooks: {
			after: [...(rbacExtension.hooks?.after || [])],
		},

		async init(ctx: AuthContext) {
			// Initialize RBAC extension
			const rbacInit = await rbacExtension.init?.(ctx);

			return {
				...rbacInit,
			};
		},
	} as BetterAuthPlugin;
};

/**
 * Setup RBAC for a newly created organization
 */
async function setupOrganizationRbac(
	context: AuthContext,
	organization: any,
	member: any,
	options?: RbacOrganizationOptions,
) {
	console.log("DEBUG: setupOrganizationRbac called for org:", organization.id);
	const rbacAdapter = (context as any).rbacAdapter;
	if (!rbacAdapter) {
		console.log("DEBUG: No RBAC adapter found");
		return;
	}

	try {
		// Create default permissions
		const defaultPermissions = options?.rbac?.customPermissions || [];
		const systemPermissions = Object.values(SYSTEM_PERMISSIONS);

		const allPermissions = [
			...systemPermissions.map((name) => {
				const [resource, action] = name.split(":");
				return {
					name,
					resource,
					action,
					description: `System permission: ${name}`,
					organizationId: organization.id, // Add organization ID
					isSystem: true,
					createdAt: new Date(), // Add createdAt
				};
			}),
			...defaultPermissions.map((permission) => ({
				...permission,
				organizationId: organization.id, // Add organization ID
				createdAt: new Date(), // Add createdAt
			})),
		];

		// Create permissions
		const createdPermissions = [];
		for (const permission of allPermissions) {
			try {
				const existing = await rbacAdapter.findPermissionByName(
					permission.name,
				);
				if (!existing) {
					const created = await rbacAdapter.createPermission(permission);
					createdPermissions.push(created);
				} else {
					createdPermissions.push(existing);
				}
			} catch (error) {
				console.warn(`Failed to create permission ${permission.name}:`, error);
			}
		}

		// Create default roles
		const defaultRoles = options?.rbac?.defaultRoles || [
			{
				name: "Organization Owner",
				description: "Full access to the organization",
				level: 0,
				permissions: Object.values(SYSTEM_PERMISSIONS),
				isCreatorRole: true,
			},
			{
				name: "Organization Admin",
				description: "Administrative access to the organization",
				level: 1,
				permissions: [
					SYSTEM_PERMISSIONS.ORGANIZATION_READ,
					SYSTEM_PERMISSIONS.ORGANIZATION_UPDATE,
					SYSTEM_PERMISSIONS.MEMBER_INVITE,
					SYSTEM_PERMISSIONS.MEMBER_READ,
					SYSTEM_PERMISSIONS.MEMBER_UPDATE,
					SYSTEM_PERMISSIONS.MEMBER_REMOVE,
					SYSTEM_PERMISSIONS.TEAM_CREATE,
					SYSTEM_PERMISSIONS.TEAM_READ,
					SYSTEM_PERMISSIONS.TEAM_UPDATE,
					SYSTEM_PERMISSIONS.TEAM_DELETE,
					SYSTEM_PERMISSIONS.ROLE_READ,
					SYSTEM_PERMISSIONS.ROLE_ASSIGN,
				],
			},
			{
				name: "Member",
				description: "Standard member of the organization",
				level: 3,
				permissions: [
					SYSTEM_PERMISSIONS.ORGANIZATION_READ,
					SYSTEM_PERMISSIONS.MEMBER_READ,
					SYSTEM_PERMISSIONS.TEAM_READ,
				],
			},
		];

		// Create roles and assign permissions
		const createdRoles = [];
		for (const roleData of defaultRoles) {
			try {
				const role = await rbacAdapter.createRole({
					name: roleData.name,
					description: roleData.description,
					level: roleData.level || 0,
					organizationId: organization.id,
					isSystem: true,
					createdAt: new Date(), // Add createdAt
				});

				// Assign permissions to role
				for (const permissionName of roleData.permissions) {
					const permission = createdPermissions.find(
						(p) => p.name === permissionName,
					);
					if (permission) {
						await rbacAdapter.assignPermissionToRole({
							roleId: role.id,
							permissionId: permission.id,
							granted: true,
							createdAt: new Date(), // Add createdAt
						});
					}
				}

				createdRoles.push(role);

				// Assign creator role to organization creator
				if (roleData.isCreatorRole && member) {
					await rbacAdapter.assignRoleToUser({
						userId: member.userId,
						roleId: role.id,
						organizationId: organization.id,
						assignedBy: member.userId,
						assignedAt: new Date(), // Use assignedAt per Zod schema
					});
				}
			} catch (error) {
				console.warn(`Failed to create role ${roleData.name}:`, error);
			}
		}

		// Call organization creation hook
		if (options?.rbac?.hooks?.onOrganizationCreate) {
			await options.rbac.hooks.onOrganizationCreate(
				{
					organizationId: organization.id,
					creatorId: member.userId,
				},
				{
					context,
					user: member.user,
					organizationId: organization.id,
				},
			);
		}

		// Create audit log entry
		await rbacAdapter.createAuditLog({
			action: "ORGANIZATION_RBAC_SETUP",
			resource: "organization",
			resourceId: organization.id,
			userId: member.userId,
			organizationId: organization.id,
			details: JSON.stringify({
				rolesCreated: createdRoles.length,
				permissionsCreated: createdPermissions.length,
			}),
			timestamp: new Date(), // Use timestamp per Zod schema
		});
	} catch (error) {
		console.error("Failed to setup RBAC for organization:", error);
		// Don't throw error to avoid breaking organization creation
		// Just log the issue
	}
}
