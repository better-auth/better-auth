import * as z from "zod";
import { createAuthEndpoint } from "../../../api";
import { APIError } from "better-call";
import { getWorkspaceAdapter } from "../adapter";
import { workspaceMiddleware, workspaceSessionMiddleware } from "../call";
import { WORKSPACE_ERROR_CODES } from "../error-codes";
import { checkRolePermissions, getValidRoles } from "../access";
import type { WorkspaceOptions, WorkspaceMember } from "../types";
import { toZodSchema, type FieldAttribute } from "../../../db";

// Helper function to create role validation schema
const createRoleSchema = (options?: WorkspaceOptions) => {
	const validRoles = getValidRoles(options);
	return z.enum(validRoles as [string, ...string[]], {
		message: `Role must be one of: ${validRoles.join(", ")}`,
	});
};

// Helper function to project only safe fields from workspace member objects
const projectSafeMemberFields = (member: WorkspaceMember) => ({
	id: member.id,
	workspaceId: member.workspaceId,
	userId: member.userId,
	role: member.role,
	createdAt: member.createdAt,
});

export const addWorkspaceMember = <O extends WorkspaceOptions>(options?: O) => {
	const additionalFieldsSchema = toZodSchema({
		fields: (options?.schema?.workspaceMember?.additionalFields ||
			{}) as Record<string, FieldAttribute>,
		isClientSide: true,
	});

	return createAuthEndpoint(
		"/workspace/add-member",
		{
			method: "POST",
			body: z.object({
				workspaceId: z.string(),
				userId: z.string(),
				role: createRoleSchema(options).default("member"),
				...additionalFieldsSchema.shape,
			}),
			use: [workspaceMiddleware, workspaceSessionMiddleware],
			metadata: {
				openapi: {
					description: "Add member to workspace",
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

			// Check if current user has permission to add members
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

			// Check if user is already a member
			const existingMember = await adapter.findWorkspaceMember(
				ctx.body.workspaceId,
				ctx.body.userId,
			);
			if (existingMember) {
				throw new APIError("BAD_REQUEST", {
					message: WORKSPACE_ERROR_CODES.WORKSPACE_MEMBER_ALREADY_EXISTS,
				});
			}

			// Check if user is a member of the organization
			const orgAdapter = ctx.context.adapter;
			const orgMember = await orgAdapter.findOne({
				model: "member",
				where: [
					{ field: "userId", value: ctx.body.userId },
					{ field: "organizationId", value: workspace.organizationId },
				],
			});

			if (!orgMember) {
				throw new APIError("BAD_REQUEST", {
					message: "User must be an organization member first",
				});
			}

			// Extract additional fields from the request body
			const { workspaceId, userId, role, ...additionalFields } = ctx.body;

			let memberData: Omit<WorkspaceMember, "id" | "createdAt"> &
				Record<string, any> = {
				workspaceId,
				userId,
				role,
				...additionalFields, // Include validated additional fields
			};

			// Run beforeAddWorkspaceMember hook
			if (options?.workspaceHooks?.beforeAddWorkspaceMember) {
				const user = (await orgAdapter.findOne({
					model: "user",
					where: [{ field: "id", value: ctx.body.userId }],
				})) as any;

				const response = await options.workspaceHooks.beforeAddWorkspaceMember({
					member: memberData as WorkspaceMember, // ID and createdAt will be set by adapter
					workspace,
					user,
				});

				if (response?.data) {
					memberData = { ...memberData, ...response.data };
				}
			}

			const member = await adapter.addWorkspaceMember(memberData);

			// Run afterAddWorkspaceMember hook
			if (options?.workspaceHooks?.afterAddWorkspaceMember) {
				const user = (await orgAdapter.findOne({
					model: "user",
					where: [{ field: "id", value: ctx.body.userId }],
				})) as any;

				await options.workspaceHooks.afterAddWorkspaceMember({
					member,
					workspace,
					user,
				});
			}

			return ctx.json(projectSafeMemberFields(member));
		},
	);
};

export const removeWorkspaceMember = <O extends WorkspaceOptions>(
	options?: O,
) =>
	createAuthEndpoint(
		"/workspace/remove-member",
		{
			method: "POST",
			body: z.object({
				workspaceId: z.string(),
				userId: z.string(),
			}),
			use: [workspaceMiddleware, workspaceSessionMiddleware],
			metadata: {
				openapi: {
					description: "Remove member from workspace",
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

			// Find the member to remove
			const memberToRemove = await adapter.findWorkspaceMember(
				ctx.body.workspaceId,
				ctx.body.userId,
			);
			if (!memberToRemove) {
				throw new APIError("NOT_FOUND", {
					message: WORKSPACE_ERROR_CODES.WORKSPACE_MEMBER_NOT_FOUND,
				});
			}

			// Check if current user has permission to remove members
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

			// Don't allow removing the last owner
			// Note: This check has a small race condition window. For production use,
			// consider implementing a database constraint or using a transaction-based approach.
			if (memberToRemove.role === "owner") {
				const allMembers = await adapter.listWorkspaceMembers(
					ctx.body.workspaceId,
				);
				const ownerCount = allMembers.filter((m) => m.role === "owner").length;

				if (ownerCount <= 1) {
					throw new APIError("BAD_REQUEST", {
						message: WORKSPACE_ERROR_CODES.CANNOT_REMOVE_LAST_OWNER,
					});
				}
			}

			// Run beforeRemoveWorkspaceMember hook
			if (options?.workspaceHooks?.beforeRemoveWorkspaceMember) {
				const orgAdapter = ctx.context.adapter;
				const user = (await orgAdapter.findOne({
					model: "user",
					where: [{ field: "id", value: ctx.body.userId }],
				})) as any;

				await options.workspaceHooks.beforeRemoveWorkspaceMember({
					member: memberToRemove,
					workspace,
					user,
				});
			}

			// Perform final owner count check right before removal to minimize race condition
			// This reduces but doesn't eliminate the TOCTOU window
			if (memberToRemove.role === "owner") {
				const allMembers = await adapter.listWorkspaceMembers(
					ctx.body.workspaceId,
				);
				const ownerCount = allMembers.filter((m) => m.role === "owner").length;

				if (ownerCount <= 1) {
					throw new APIError("BAD_REQUEST", {
						message: WORKSPACE_ERROR_CODES.CANNOT_REMOVE_LAST_OWNER,
					});
				}
			}

			await adapter.removeWorkspaceMember(memberToRemove.id);

			// Run afterRemoveWorkspaceMember hook
			if (options?.workspaceHooks?.afterRemoveWorkspaceMember) {
				const orgAdapter = ctx.context.adapter;
				const user = (await orgAdapter.findOne({
					model: "user",
					where: [{ field: "id", value: ctx.body.userId }],
				})) as any;

				await options.workspaceHooks.afterRemoveWorkspaceMember({
					member: memberToRemove,
					workspace,
					user,
				});
			}

			return ctx.json({ success: true });
		},
	);

export const updateWorkspaceMemberRole = <O extends WorkspaceOptions>(
	options?: O,
) =>
	createAuthEndpoint(
		"/workspace/update-member-role",
		{
			method: "POST",
			body: z.object({
				workspaceId: z.string(),
				userId: z.string(),
				role: createRoleSchema(options),
			}),
			use: [workspaceMiddleware, workspaceSessionMiddleware],
			metadata: {
				openapi: {
					description: "Update workspace member role",
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

			// Find the member to update
			const memberToUpdate = await adapter.findWorkspaceMember(
				ctx.body.workspaceId,
				ctx.body.userId,
			);
			if (!memberToUpdate) {
				throw new APIError("NOT_FOUND", {
					message: WORKSPACE_ERROR_CODES.WORKSPACE_MEMBER_NOT_FOUND,
				});
			}

			// Don't allow users to modify their own role
			if (ctx.body.userId === session.user.id) {
				throw new APIError("BAD_REQUEST", {
					message: WORKSPACE_ERROR_CODES.CANNOT_MODIFY_OWN_ROLE,
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

			// Don't allow removing the last owner by changing their role
			// Note: This check has a small race condition window. For production use,
			// consider implementing a database constraint or using a transaction-based approach.
			if (memberToUpdate.role === "owner" && ctx.body.role !== "owner") {
				const allMembers = await adapter.listWorkspaceMembers(
					ctx.body.workspaceId,
				);
				const ownerCount = allMembers.filter((m) => m.role === "owner").length;

				if (ownerCount <= 1) {
					throw new APIError("BAD_REQUEST", {
						message: WORKSPACE_ERROR_CODES.CANNOT_REMOVE_LAST_OWNER,
					});
				}

				// Perform final owner count check right before role update to minimize race condition
				// This reduces but doesn't eliminate the TOCTOU window
				const finalMembers = await adapter.listWorkspaceMembers(
					ctx.body.workspaceId,
				);
				const finalOwnerCount = finalMembers.filter(
					(m) => m.role === "owner",
				).length;

				if (finalOwnerCount <= 1) {
					throw new APIError("BAD_REQUEST", {
						message: WORKSPACE_ERROR_CODES.CANNOT_REMOVE_LAST_OWNER,
					});
				}
			}

			const updatedMember = await adapter.updateWorkspaceMemberRole(
				memberToUpdate.id,
				ctx.body.role,
			);

			return ctx.json(projectSafeMemberFields(updatedMember));
		},
	);

export const listWorkspaceMembers = <O extends WorkspaceOptions>(options?: O) =>
	createAuthEndpoint(
		"/workspace/list-members",
		{
			method: "GET",
			query: z.object({
				workspaceId: z.string().optional(),
			}),
			use: [workspaceMiddleware, workspaceSessionMiddleware],
			metadata: {
				openapi: {
					description: "List workspace members",
				},
			},
		},
		async (ctx) => {
			const session = ctx.context.session;
			const adapter = getWorkspaceAdapter(ctx.context, options);

			const workspaceId =
				ctx.query?.workspaceId || session.session.activeWorkspaceId;

			if (!workspaceId) {
				throw new APIError("BAD_REQUEST", {
					message: WORKSPACE_ERROR_CODES.NO_ACTIVE_WORKSPACE,
				});
			}

			const workspace = await adapter.findWorkspaceById(workspaceId);
			if (!workspace) {
				throw new APIError("NOT_FOUND", {
					message: WORKSPACE_ERROR_CODES.WORKSPACE_NOT_FOUND,
				});
			}

			// Check if user is a member of this workspace
			const member = await adapter.findWorkspaceMember(
				workspaceId,
				session.user.id,
			);
			if (!member) {
				throw new APIError("FORBIDDEN", {
					message: WORKSPACE_ERROR_CODES.USER_NOT_WORKSPACE_MEMBER,
				});
			}

			const members = await adapter.listWorkspaceMembers(workspaceId);

			// Project only safe fields to avoid exposing sensitive additionalFields
			const safeMembers = members.map(projectSafeMemberFields);

			return ctx.json(safeMembers);
		},
	);
