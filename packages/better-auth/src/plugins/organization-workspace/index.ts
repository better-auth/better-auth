import type { BetterAuthPlugin, AuthPluginSchema } from "../../";
import { mergeSchema } from "../../db";
import { createAuthMiddleware } from "../../api";
import type { WorkspaceOptions } from "./types";
import {
	createWorkspace,
	getWorkspace,
	updateWorkspace,
	deleteWorkspace,
	listWorkspaces,
	setActiveWorkspace,
} from "./routes/workspace-crud";
import {
	addWorkspaceMember,
	removeWorkspaceMember,
	updateWorkspaceMemberRole,
	listWorkspaceMembers,
} from "./routes/workspace-members";
import {
	addWorkspaceTeamMember,
	removeWorkspaceTeamMember,
	updateWorkspaceTeamMemberRole,
	listWorkspaceTeamMembers,
} from "./routes/workspace-team-members";

/**
 * Workspace plugin for Better Auth. Adds workspaces as sub-entities under organizations
 * with comprehensive member management and permission controls.
 *
 * @example
 * ```ts
 * const auth = betterAuth({
 *   plugins: [
 *     organization(),
 *     workspace({
 *       createDefaultWorkspace: true,
 *       defaultWorkspaceName: "General",
 *     }),
 *   ],
 * });
 * ```
 */
export const workspace = <O extends WorkspaceOptions>(options?: O) => {
	const opts = {
		createDefaultWorkspace: options?.createDefaultWorkspace ?? true,
		defaultWorkspaceName: options?.defaultWorkspaceName ?? "General",
		...options,
	};

	const schema: AuthPluginSchema = {
		workspace: {
			fields: {
				name: {
					type: "string",
					required: true,
				},
				slug: {
					type: "string",
					required: false,
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
						onDelete: "cascade",
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
				updatedAt: {
					type: "date",
					required: true,
				},
				...(options?.schema?.workspace?.additionalFields || {}),
			},
		},
		workspaceMember: {
			fields: {
				workspaceId: {
					type: "string",
					required: true,
					references: {
						model: "workspace",
						field: "id",
						onDelete: "cascade",
					},
				},
				userId: {
					type: "string",
					required: true,
					references: {
						model: "user",
						field: "id",
						onDelete: "cascade",
					},
				},
				role: {
					type: "string",
					required: true,
					defaultValue: "member",
				},
				createdAt: {
					type: "date",
					required: true,
				},
				...(options?.schema?.workspaceMember?.additionalFields || {}),
			},
		},
		workspaceTeamMember: {
			fields: {
				workspaceId: {
					type: "string",
					required: true,
					references: {
						model: "workspace",
						field: "id",
						onDelete: "cascade",
					},
				},
				teamId: {
					type: "string",
					required: true,
					references: {
						model: "team",
						field: "id",
						onDelete: "cascade",
					},
				},
				role: {
					type: "string",
					required: true,
					defaultValue: "member",
				},
				createdAt: {
					type: "date",
					required: true,
				},
				...(options?.schema?.workspaceTeamMember?.additionalFields || {}),
			},
		},
		session: {
			fields: {
				activeWorkspaceId: {
					type: "string",
					required: false,
					references: {
						model: "workspace",
						field: "id",
						onDelete: "set null",
					},
				},
			},
		},
	};

	return {
		id: "workspace",
		init(ctx) {
			return {
				options: {
					...ctx.options,
					workspace: opts,
				},
			};
		},
		endpoints: {
			// Workspace CRUD
			createWorkspace: createWorkspace(opts),
			getWorkspace: getWorkspace(opts),
			updateWorkspace: updateWorkspace(opts),
			deleteWorkspace: deleteWorkspace(opts),
			listWorkspaces: listWorkspaces(opts),
			setActiveWorkspace: setActiveWorkspace(opts),

			// Workspace member management
			addWorkspaceMember: addWorkspaceMember(opts),
			removeWorkspaceMember: removeWorkspaceMember(opts),
			updateWorkspaceMemberRole: updateWorkspaceMemberRole(opts),
			listWorkspaceMembers: listWorkspaceMembers(opts),

			// Workspace team member management
			addWorkspaceTeamMember: addWorkspaceTeamMember(opts),
			removeWorkspaceTeamMember: removeWorkspaceTeamMember(opts),
			updateWorkspaceTeamMemberRole: updateWorkspaceTeamMemberRole(opts),
			listWorkspaceTeamMembers: listWorkspaceTeamMembers(opts),
		},
		hooks: {
			after: [
				{
					// Hook to create default workspace when organization is created
					matcher(context) {
						return (
							context.path === "/organization/create" &&
							opts.createDefaultWorkspace
						);
					},
					handler: createAuthMiddleware(async (ctx) => {
						if (!opts.createDefaultWorkspace) return;

						try {
							// Access the returned response data from organization creation
							const response = ctx.context.returned;
							if (
								response &&
								typeof response === "object" &&
								"id" in response
							) {
								const organizationId = (response as { id: string }).id;

								// Create default workspace
								const adapter = ctx.context.adapter;
								await adapter.create({
									model: "workspace",
									data: {
										name: opts.defaultWorkspaceName,
										organizationId,
										createdAt: new Date(),
										updatedAt: new Date(),
									},
								});
							}
						} catch (error) {
							// Log error but don't fail the organization creation
							// eslint-disable-next-line no-console
							console.error("Failed to create default workspace:", error);
						}
					}),
				},
			],
		},
		schema: mergeSchema(schema, {}),
		$Infer: {
			Session: {} as {
				activeWorkspaceId?: string;
			},
		},
	} satisfies BetterAuthPlugin;
};

export * from "./types";
export * from "./schema";
export * from "./access";
export * from "./error-codes";
export * from "./adapter";
export * from "./has-permission";
