import * as z from "zod";
import { createAuthEndpoint } from "../../../api";
import { APIError } from "better-call";
import { getWorkspaceAdapter } from "../adapter";
import { workspaceMiddleware, workspaceSessionMiddleware } from "../call";
import { WORKSPACE_ERROR_CODES } from "../error-codes";
import { checkRolePermissions } from "../access";
import type { WorkspaceOptions } from "../types";
import { toZodSchema } from "../../../db";

export const addWorkspaceTeamMember = <O extends WorkspaceOptions>(
	options?: O,
) => {
	const additionalFieldsSchema = toZodSchema({
		fields: options?.schema?.workspaceTeamMember?.additionalFields || {},
		isClientSide: true,
	});

	return createAuthEndpoint(
		"/workspace/add-team-member",
		{
			method: "POST",
			body: z.object({
				workspaceId: z.string(),
				teamId: z.string(),
				role: z.string().default("member"),
				...additionalFieldsSchema.shape,
			}),
			use: [workspaceMiddleware, workspaceSessionMiddleware],
			metadata: {
				openapi: {
					description: "Add team as member to workspace",
				},
			},
		},
		async (ctx) => {
			const session = ctx.context.session;
			const adapter = getWorkspaceAdapter(ctx.context, options);

			const workspace = await adapter.findWorkspaceById(ctx.body.workspaceId);
			if (!workspace) {
				throw new APIError("NOT_FOUND", {
					message: WORKSPACE_ERROR_CODES.WORKSPACE_NOT_FOUND,
				});
			}

			// Check if current user has permission to add team members
			const currentMember = await adapter.findWorkspaceMember(
				ctx.body.workspaceId,
				session.user.id,
			);
			if (!currentMember) {
				throw new APIError("FORBIDDEN", {
					message: WORKSPACE_ERROR_CODES.USER_NOT_WORKSPACE_MEMBER,
				});
			}

			const canAddMember = checkRolePermissions({
				role: currentMember.role,
				permissions: { "workspace-member": ["add"] },
				options,
			});

			if (!canAddMember) {
				throw new APIError("FORBIDDEN", {
					message: WORKSPACE_ERROR_CODES.INSUFFICIENT_PERMISSIONS,
				});
			}

			// Check if team exists and is part of the same organization
			const orgAdapter = ctx.context.adapter;
			const team = await orgAdapter.findOne({
				model: "team",
				where: [
					{ field: "id", value: ctx.body.teamId },
					{ field: "organizationId", value: workspace.organizationId },
				],
			});

			if (!team) {
				throw new APIError("BAD_REQUEST", {
					message: "Team not found in this organization",
				});
			}

			// Check if team is already a member
			const existingTeamMember = await adapter.findWorkspaceTeamMember(
				ctx.body.workspaceId,
				ctx.body.teamId,
			);

			if (existingTeamMember) {
				throw new APIError("BAD_REQUEST", {
					message: "Team is already a member of this workspace",
				});
			}

			let teamMemberData = {
				workspaceId: ctx.body.workspaceId,
				teamId: ctx.body.teamId,
				role: ctx.body.role,
			};

			// Run beforeAddWorkspaceTeamMember hook
			if (options?.workspaceHooks?.beforeAddWorkspaceTeamMember) {
				const hookResult =
					await options.workspaceHooks.beforeAddWorkspaceTeamMember({
						teamMember: teamMemberData,
						workspace,
						team,
						user: session.user,
					});

				if (hookResult?.data) {
					teamMemberData = { ...teamMemberData, ...hookResult.data };
				}
			}

			// Create team member
			const teamMember = await adapter.addWorkspaceTeamMember(teamMemberData);

			// Run afterAddWorkspaceTeamMember hook
			if (options?.workspaceHooks?.afterAddWorkspaceTeamMember) {
				await options.workspaceHooks.afterAddWorkspaceTeamMember({
					teamMember,
					workspace,
					team,
					user: session.user,
				});
			}

			return ctx.json({ teamMember });
		},
	);
};

export const removeWorkspaceTeamMember = <O extends WorkspaceOptions>(
	options?: O,
) =>
	createAuthEndpoint(
		"/workspace/remove-team-member",
		{
			method: "POST",
			body: z.object({
				workspaceId: z.string(),
				teamId: z.string(),
			}),
			use: [workspaceMiddleware, workspaceSessionMiddleware],
			metadata: {
				openapi: {
					description: "Remove team from workspace",
				},
			},
		},
		async (ctx) => {
			const session = ctx.context.session;
			const adapter = getWorkspaceAdapter(ctx.context, options);

			const workspace = await adapter.findWorkspaceById(ctx.body.workspaceId);
			if (!workspace) {
				throw new APIError("NOT_FOUND", {
					message: WORKSPACE_ERROR_CODES.WORKSPACE_NOT_FOUND,
				});
			}

			// Check if current user has permission to remove team members
			const currentMember = await adapter.findWorkspaceMember(
				ctx.body.workspaceId,
				session.user.id,
			);
			if (!currentMember) {
				throw new APIError("FORBIDDEN", {
					message: WORKSPACE_ERROR_CODES.USER_NOT_WORKSPACE_MEMBER,
				});
			}

			const canRemoveMember = checkRolePermissions({
				role: currentMember.role,
				permissions: { "workspace-member": ["remove"] },
				options,
			});

			if (!canRemoveMember) {
				throw new APIError("FORBIDDEN", {
					message: WORKSPACE_ERROR_CODES.INSUFFICIENT_PERMISSIONS,
				});
			}

			// Find team member
			const teamMember = await adapter.findWorkspaceTeamMember(
				ctx.body.workspaceId,
				ctx.body.teamId,
			);

			if (!teamMember) {
				throw new APIError("NOT_FOUND", {
					message: "Team is not a member of this workspace",
				});
			}

			// Get team for hooks
			const orgAdapter = ctx.context.adapter;
			const team = await orgAdapter.findOne({
				model: "team",
				where: [{ field: "id", value: ctx.body.teamId }],
			});

			// Run beforeRemoveWorkspaceTeamMember hook
			if (options?.workspaceHooks?.beforeRemoveWorkspaceTeamMember) {
				await options.workspaceHooks.beforeRemoveWorkspaceTeamMember({
					teamMember,
					workspace,
					team,
					user: session.user,
				});
			}

			// Remove team member
			await adapter.removeWorkspaceTeamMember(teamMember.id);

			// Run afterRemoveWorkspaceTeamMember hook
			if (options?.workspaceHooks?.afterRemoveWorkspaceTeamMember) {
				await options.workspaceHooks.afterRemoveWorkspaceTeamMember({
					teamMember,
					workspace,
					team,
					user: session.user,
				});
			}

			return ctx.json({ success: true });
		},
	);

export const updateWorkspaceTeamMemberRole = <O extends WorkspaceOptions>(
	options?: O,
) =>
	createAuthEndpoint(
		"/workspace/update-team-member-role",
		{
			method: "POST",
			body: z.object({
				workspaceId: z.string(),
				teamId: z.string(),
				role: z.string(),
			}),
			use: [workspaceMiddleware, workspaceSessionMiddleware],
			metadata: {
				openapi: {
					description: "Update team member role in workspace",
				},
			},
		},
		async (ctx) => {
			const session = ctx.context.session;
			const adapter = getWorkspaceAdapter(ctx.context, options);

			const workspace = await adapter.findWorkspaceById(ctx.body.workspaceId);
			if (!workspace) {
				throw new APIError("NOT_FOUND", {
					message: WORKSPACE_ERROR_CODES.WORKSPACE_NOT_FOUND,
				});
			}

			// Check if current user has permission to update member roles
			const currentMember = await adapter.findWorkspaceMember(
				ctx.body.workspaceId,
				session.user.id,
			);
			if (!currentMember) {
				throw new APIError("FORBIDDEN", {
					message: WORKSPACE_ERROR_CODES.USER_NOT_WORKSPACE_MEMBER,
				});
			}

			const canUpdateRole = checkRolePermissions({
				role: currentMember.role,
				permissions: { "workspace-member": ["update-role"] },
				options,
			});

			if (!canUpdateRole) {
				throw new APIError("FORBIDDEN", {
					message: WORKSPACE_ERROR_CODES.INSUFFICIENT_PERMISSIONS,
				});
			}

			// Find team member
			const teamMember = await adapter.findWorkspaceTeamMember(
				ctx.body.workspaceId,
				ctx.body.teamId,
			);

			if (!teamMember) {
				throw new APIError("NOT_FOUND", {
					message: "Team is not a member of this workspace",
				});
			}

			// Update team member role
			const updatedTeamMember = await adapter.updateWorkspaceTeamMemberRole(
				teamMember.id,
				ctx.body.role,
			);

			return ctx.json({ teamMember: updatedTeamMember });
		},
	);

export const listWorkspaceTeamMembers = <O extends WorkspaceOptions>(
	options?: O,
) =>
	createAuthEndpoint(
		"/workspace/list-team-members",
		{
			method: "GET",
			query: z.object({
				workspaceId: z.string(),
			}),
			use: [workspaceMiddleware, workspaceSessionMiddleware],
			metadata: {
				openapi: {
					description: "List team members of workspace",
				},
			},
		},
		async (ctx) => {
			const session = ctx.context.session;
			const adapter = getWorkspaceAdapter(ctx.context, options);

			const workspace = await adapter.findWorkspaceById(ctx.query.workspaceId);
			if (!workspace) {
				throw new APIError("NOT_FOUND", {
					message: WORKSPACE_ERROR_CODES.WORKSPACE_NOT_FOUND,
				});
			}

			// Check if current user has permission to view workspace
			const currentMember = await adapter.findWorkspaceMember(
				ctx.query.workspaceId,
				session.user.id,
			);
			if (!currentMember) {
				throw new APIError("FORBIDDEN", {
					message: WORKSPACE_ERROR_CODES.USER_NOT_WORKSPACE_MEMBER,
				});
			}

			// Get team members
			const teamMembers = await adapter.listWorkspaceTeamMembers(
				ctx.query.workspaceId,
			);

			// Get team details for each team member
			const orgAdapter = ctx.context.adapter;
			const teamMembersWithDetails = await Promise.all(
				teamMembers.map(
					async (teamMember: { teamId: string; [key: string]: unknown }) => {
						const team = await orgAdapter.findOne({
							model: "team",
							where: [{ field: "id", value: teamMember.teamId }],
						});
						return {
							...teamMember,
							team,
						};
					},
				),
			);

			return ctx.json({ teamMembers: teamMembersWithDetails });
		},
	);
