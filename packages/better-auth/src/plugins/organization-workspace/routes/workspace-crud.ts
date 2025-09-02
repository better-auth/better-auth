import * as z from "zod";
import { createAuthEndpoint } from "../../../api";
import { APIError } from "better-call";
import { getWorkspaceAdapter } from "../adapter";
import { workspaceMiddleware, workspaceSessionMiddleware } from "../call";
import { WORKSPACE_ERROR_CODES } from "../error-codes";
import { checkRolePermissions } from "../access";
import type { User } from "../../../";
import type { Organization } from "../../organization";
import type { WorkspaceOptions, Workspace } from "../types";
import { toZodSchema, type FieldAttribute } from "../../../db";

export const createWorkspace = <O extends WorkspaceOptions>(options?: O) => {
	// Simplified schema handling to avoid toZodSchema issues
	const baseSchema = z.object({
		name: z.string().min(1, "Workspace name is required"),
		slug: z.string().optional(),
		description: z.string().optional(),
		organizationId: z.string().optional(), // Made optional to support using active organization from session
		metadata: z.record(z.string(), z.any()).optional(),
	});

	// Add additional fields manually if they exist
	let bodySchema = baseSchema;
	if (options?.schema?.workspace?.additionalFields) {
		const additionalShape: Record<string, any> = {};
		for (const [key, field] of Object.entries(
			options.schema.workspace.additionalFields,
		)) {
			// Simple type mapping
			if ((field as { type?: string }).type === "boolean") {
				additionalShape[key] = z.boolean().optional();
			} else if ((field as { type?: string }).type === "string") {
				additionalShape[key] = z.string().optional();
			} else if ((field as { type?: string }).type === "number") {
				additionalShape[key] = z.number().optional();
			}
			// Add more types as needed
		}

		if (Object.keys(additionalShape).length > 0) {
			bodySchema = z.object({
				...baseSchema.shape,
				...additionalShape,
			});
		}
	}

	return createAuthEndpoint(
		"/workspace/create",
		{
			method: "POST",
			body: bodySchema,
			use: [workspaceMiddleware, workspaceSessionMiddleware],
			metadata: {
				openapi: {
					description: "Create a new workspace",
					responses: {
						"200": {
							description: "Workspace created successfully",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											id: { type: "string" },
											name: { type: "string" },
											slug: { type: "string" },
											description: { type: "string" },
											organizationId: { type: "string" },
											metadata: { type: "object" },
											createdAt: { type: "string", format: "date-time" },
											updatedAt: { type: "string", format: "date-time" },
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
				throw new APIError("UNAUTHORIZED", { message: "Session required" });
			}

			const adapter = getWorkspaceAdapter(ctx.context, options);

			// Get organizationId from body or active organization in session
			const organizationId =
				ctx.body.organizationId || session.session.activeOrganizationId;

			if (!organizationId) {
				throw new APIError("BAD_REQUEST", {
					message: WORKSPACE_ERROR_CODES.NO_ACTIVE_ORGANIZATION,
				});
			}

			// Check if user is an organization member with permissions
			const orgAdapter = ctx.context.adapter;
			const orgMember = await orgAdapter.findOne({
				model: "member",
				where: [
					{ field: "userId", value: session.user.id },
					{ field: "organizationId", value: organizationId },
				],
			});

			if (!orgMember) {
				throw new APIError("FORBIDDEN", {
					message: WORKSPACE_ERROR_CODES.USER_NOT_ORGANIZATION_MEMBER,
				});
			}

			// Check permissions - only owners and admins can create workspaces
			const canCreate = checkRolePermissions({
				role: (orgMember as { role: string }).role,
				permissions: { workspace: ["create"] },
				options,
			});

			if (!canCreate) {
				throw new APIError("FORBIDDEN", {
					message: WORKSPACE_ERROR_CODES.INSUFFICIENT_PERMISSIONS,
				});
			}

			// Normalize slug if provided
			let normalizedSlug = ctx.body.slug;
			if (normalizedSlug) {
				// Apply slug normalization: lowercase, replace spaces/special chars with hyphens
				normalizedSlug = normalizedSlug
					.toLowerCase()
					.trim()
					.replace(/[^\w\s-]/g, "") // Remove special characters except spaces and hyphens
					.replace(/[\s_]+/g, "-") // Replace spaces and underscores with hyphens
					.replace(/-+/g, "-") // Replace multiple consecutive hyphens with single hyphen
					.replace(/^-+|-+$/g, ""); // Remove leading and trailing hyphens
			}

			// Check if slug is unique within the organization
			if (normalizedSlug) {
				const existing = await adapter.findWorkspaceBySlug(
					normalizedSlug,
					organizationId,
				);
				if (existing) {
					throw new APIError("BAD_REQUEST", {
						message: WORKSPACE_ERROR_CODES.WORKSPACE_SLUG_TAKEN,
					});
				}
			}

			// Create workspace
			let workspaceData = {
				name: ctx.body.name,
				slug: normalizedSlug,
				description: ctx.body.description,
				organizationId: organizationId,
				metadata: ctx.body.metadata,
			};

			// Run beforeCreateWorkspace hook
			if (options?.workspaceHooks?.beforeCreateWorkspace) {
				const organization = await orgAdapter.findOne({
					model: "organization",
					where: [{ field: "id", value: organizationId }],
				});

				const response = await options.workspaceHooks.beforeCreateWorkspace({
					workspace: workspaceData as unknown as Workspace,
					organization: organization as unknown as Organization,
					user: session.user as unknown as User,
				});

				if (response?.data) {
					workspaceData = { ...workspaceData, ...response.data };
				}
			}

			const workspace = await adapter.createWorkspace(workspaceData);

			// Add the creator as an owner of the workspace
			await adapter.addWorkspaceMember({
				workspaceId: workspace.id,
				userId: session.user.id,
				role: "owner",
			});

			// Run afterCreateWorkspace hook
			if (options?.workspaceHooks?.afterCreateWorkspace) {
				const organization = await orgAdapter.findOne({
					model: "organization",
					where: [{ field: "id", value: organizationId }],
				});

				await options.workspaceHooks.afterCreateWorkspace({
					workspace,
					organization: organization as unknown as Organization,
					user: session.user as unknown as User,
				});
			}

			return ctx.json(workspace);
		},
	);
};

export const getWorkspace = <O extends WorkspaceOptions>(options?: O) =>
	createAuthEndpoint(
		"/workspace/get",
		{
			method: "GET",
			query: z.object({
				workspaceId: z.string().optional(),
			}),
			use: [workspaceMiddleware, workspaceSessionMiddleware],
			metadata: {
				openapi: {
					description: "Get workspace details",
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

			return ctx.json(workspace);
		},
	);

export const updateWorkspace = <O extends WorkspaceOptions>(options?: O) => {
	const additionalFieldsSchema = toZodSchema({
		fields: (options?.schema?.workspace?.additionalFields || {}) as Record<
			string,
			FieldAttribute
		>,
		isClientSide: true,
	});

	return createAuthEndpoint(
		"/workspace/update",
		{
			method: "POST",
			body: z.object({
				workspaceId: z.string(),
				data: z.object({
					name: z.string().optional(),
					slug: z.string().optional(),
					description: z.string().optional(),
					metadata: z.record(z.string(), z.any()).optional(),
					...additionalFieldsSchema.shape,
				}),
			}),
			use: [workspaceMiddleware, workspaceSessionMiddleware],
			metadata: {
				openapi: {
					description: "Update workspace",
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

			// Check if user is a member with update permissions
			const member = await adapter.findWorkspaceMember(
				ctx.body.workspaceId,
				session.user.id,
			);
			if (!member) {
				throw new APIError("FORBIDDEN", {
					message: WORKSPACE_ERROR_CODES.USER_NOT_WORKSPACE_MEMBER,
				});
			}

			const canUpdate = checkRolePermissions({
				role: member.role,
				permissions: { workspace: ["update"] },
				options,
			});

			if (!canUpdate) {
				throw new APIError("FORBIDDEN", {
					message: WORKSPACE_ERROR_CODES.INSUFFICIENT_PERMISSIONS,
				});
			}

			// Check slug uniqueness if being updated
			if (ctx.body.data.slug && ctx.body.data.slug !== workspace.slug) {
				const existing = await adapter.findWorkspaceBySlug(
					ctx.body.data.slug,
					workspace.organizationId,
				);
				if (existing) {
					throw new APIError("BAD_REQUEST", {
						message: WORKSPACE_ERROR_CODES.WORKSPACE_SLUG_TAKEN,
					});
				}
			}

			const updatedWorkspace = await adapter.updateWorkspace(
				ctx.body.workspaceId,
				ctx.body.data,
			);

			return ctx.json(updatedWorkspace);
		},
	);
};

export const deleteWorkspace = <O extends WorkspaceOptions>(options?: O) =>
	createAuthEndpoint(
		"/workspace/delete",
		{
			method: "POST",
			body: z.object({
				workspaceId: z.string(),
			}),
			use: [workspaceMiddleware, workspaceSessionMiddleware],
			metadata: {
				openapi: {
					description: "Delete workspace",
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

			// Check if user is a member with delete permissions
			const member = await adapter.findWorkspaceMember(
				ctx.body.workspaceId,
				session.user.id,
			);
			if (!member) {
				throw new APIError("FORBIDDEN", {
					message: WORKSPACE_ERROR_CODES.USER_NOT_WORKSPACE_MEMBER,
				});
			}

			const canDelete = checkRolePermissions({
				role: member.role,
				permissions: { workspace: ["delete"] },
				options,
			});

			if (!canDelete) {
				throw new APIError("FORBIDDEN", {
					message: WORKSPACE_ERROR_CODES.INSUFFICIENT_PERMISSIONS,
				});
			}

			await adapter.deleteWorkspace(ctx.body.workspaceId);

			return ctx.json({ success: true });
		},
	);

export const listWorkspaces = <O extends WorkspaceOptions>(options?: O) =>
	createAuthEndpoint(
		"/workspace/list",
		{
			method: "GET",
			query: z.object({
				organizationId: z.string().optional(),
			}),
			use: [workspaceMiddleware, workspaceSessionMiddleware],
			metadata: {
				openapi: {
					description: "List workspaces",
				},
			},
		},
		async (ctx) => {
			const session = ctx.context.session;
			const adapter = getWorkspaceAdapter(ctx.context, options);

			const organizationId =
				ctx.query?.organizationId || session.session.activeOrganizationId;

			if (!organizationId) {
				// Return workspaces the user is a member of
				const workspaces = await adapter.listWorkspacesByUser(session.user.id);
				return ctx.json(workspaces);
			}

			// Check if user is an organization member
			const orgAdapter = ctx.context.adapter;
			const orgMember = await orgAdapter.findOne({
				model: "member",
				where: [
					{ field: "userId", value: session.user.id },
					{ field: "organizationId", value: organizationId },
				],
			});

			if (!orgMember) {
				throw new APIError("FORBIDDEN", {
					message: WORKSPACE_ERROR_CODES.USER_NOT_ORGANIZATION_MEMBER,
				});
			}

			// Check if user can list all workspaces or just their own
			const canListAll = checkRolePermissions({
				role: (orgMember as { role: string }).role,
				permissions: { workspace: ["list"] },
				options,
			});

			if (
				canListAll &&
				((orgMember as { role: string }).role === "owner" ||
					(orgMember as { role: string }).role === "admin")
			) {
				// Return all workspaces in the organization
				const workspaces =
					await adapter.listWorkspacesByOrganization(organizationId);
				return ctx.json(workspaces);
			}

			// Return only workspaces the user is a member of
			const userWorkspaces = await adapter.listWorkspacesByUser(
				session.user.id,
			);
			const filteredWorkspaces = userWorkspaces.filter(
				(w) => w.organizationId === organizationId,
			);
			return ctx.json(filteredWorkspaces);
		},
	);

export const setActiveWorkspace = <O extends WorkspaceOptions>(options?: O) =>
	createAuthEndpoint(
		"/workspace/set-active",
		{
			method: "POST",
			body: z.object({
				workspaceId: z.string().nullable(),
			}),
			use: [workspaceMiddleware, workspaceSessionMiddleware],
			metadata: {
				openapi: {
					description: "Set active workspace",
				},
			},
		},
		async (ctx) => {
			const session = ctx.context.session;
			const adapter = getWorkspaceAdapter(ctx.context, options);

			if (ctx.body.workspaceId === null) {
				// Clear active workspace
				await adapter.setActiveWorkspace(session.session.token, null);
				return ctx.json({ success: true });
			}

			const workspace = await adapter.findWorkspaceById(ctx.body.workspaceId);
			if (!workspace) {
				throw new APIError("NOT_FOUND", {
					message: WORKSPACE_ERROR_CODES.WORKSPACE_NOT_FOUND,
				});
			}

			// Check if user is a member of this workspace
			const member = await adapter.findWorkspaceMember(
				ctx.body.workspaceId,
				session.user.id,
			);
			if (!member) {
				throw new APIError("FORBIDDEN", {
					message: WORKSPACE_ERROR_CODES.USER_NOT_WORKSPACE_MEMBER,
				});
			}

			await adapter.setActiveWorkspace(
				session.session.token,
				ctx.body.workspaceId,
			);

			return ctx.json({ success: true });
		},
	);
