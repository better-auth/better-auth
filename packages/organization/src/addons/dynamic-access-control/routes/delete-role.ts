import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import { getSessionFromCtx } from "better-auth/api";
import * as z from "zod/v4";
import { hasPermission } from "../../../access";
import { ORGANIZATION_ERROR_CODES } from "../../../helpers/error-codes";
import { getOrgAdapter } from "../../../helpers/get-org-adapter";
import { getOrganizationId } from "../../../helpers/get-organization-id";
import { orgMiddleware } from "../../../middleware/org-middleware";
import { DYNAMIC_ACCESS_CONTROL_ERROR_CODES } from "../helpers/errors";
import type { RealRoleId } from "../helpers/get-adapter";
import { getAdapter } from "../helpers/get-adapter";
import { getHook } from "../helpers/get-hook";
import { resolveOptions } from "../helpers/resolve-options";
import type { DynamicAccessControlOptions } from "../types";

const deleteRoleBodySchema = z
	.object({
		organizationId: z
			.string()
			.meta({
				description:
					"The organization reference ID. If not provided, uses the active organization.",
			})
			.optional(),
	})
	.and(
		z.union([
			z.object({
				roleId: z.string().min(1).meta({
					description: "The ID of the role to delete",
				}),
			}),
			z.object({
				roleName: z.string().min(1).meta({
					description: "The name of the role to delete",
				}),
			}),
		]),
	);

export const deleteRole = <O extends DynamicAccessControlOptions>(
	_options?: O | undefined,
) => {
	const options = resolveOptions(_options);

	return createAuthEndpoint(
		"/organization/delete-role",
		{
			method: "POST",
			body: deleteRoleBodySchema,
			use: [orgMiddleware],
			metadata: {
				$Infer: {
					body: {} as {
						roleId?: string | undefined;
						roleName?: string | undefined;
						organizationId?: string | undefined;
					},
				},
				openapi: {
					description: "Delete a role from an organization",
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
												description: "Whether the deletion was successful",
											},
										},
										required: ["success"],
									},
								},
							},
						},
					},
				},
			},
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session) throw APIError.fromStatus("UNAUTHORIZED");

			const orgAdapter = getOrgAdapter(ctx.context, ctx.context.orgOptions);
			const roleAdapter = getAdapter(ctx.context, options);
			const orgId = await getOrganizationId({ ctx });
			const realOrganizationId = await orgAdapter.getRealOrganizationId(orgId);

			const member = await orgAdapter.findMemberByOrgId({
				userId: session.user.id,
				organizationId: realOrganizationId,
			});

			if (!member) {
				const code = "YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("FORBIDDEN", msg);
			}

			const canDelete = await hasPermission(
				{
					role: member.role,
					options: ctx.context.orgOptions,
					permissions: { ac: ["delete"] },
					organizationId: realOrganizationId,
				},
				ctx,
			);

			if (!canDelete) {
				const code = "YOU_ARE_NOT_ALLOWED_TO_DELETE_A_ROLE";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("FORBIDDEN", msg);
			}

			const org = await orgAdapter.findOrganizationById(realOrganizationId);
			if (!org) {
				const msg = ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND;
				throw APIError.from("BAD_REQUEST", msg);
			}

			// Determine role to delete - by ID or by name
			let role: Awaited<ReturnType<typeof roleAdapter.findRoleById>> = null;
			if ("roleId" in ctx.body && ctx.body.roleId) {
				role = await roleAdapter.findRoleById({
					roleId: ctx.body.roleId,
					organizationId: realOrganizationId,
				});
			} else if ("roleName" in ctx.body && ctx.body.roleName) {
				role = await roleAdapter.findRoleByName({
					roleName: ctx.body.roleName,
					organizationId: realOrganizationId,
				});
			}

			if (!role) {
				const msg = DYNAMIC_ACCESS_CONTROL_ERROR_CODES.ROLE_NOT_FOUND;
				throw APIError.from("BAD_REQUEST", msg);
			}

			// Prevent deletion of pre-defined roles (check after role is found)
			const defaultRoles = ctx.context.orgOptions.roles
				? Object.keys(ctx.context.orgOptions.roles)
				: ["owner", "admin", "member"];
			if (defaultRoles.includes(role.role.toLowerCase())) {
				const msg = ORGANIZATION_ERROR_CODES.CANNOT_DELETE_A_PRE_DEFINED_ROLE;
				throw APIError.from("BAD_REQUEST", msg);
			}

			const membersWithRole = await ctx.context.adapter.findMany<{
				role: string;
			}>({
				model: "member",
				where: [
					{
						field: "organizationId",
						value: realOrganizationId,
					},
					{
						field: "role",
						value: role.role,
						operator: "contains",
					},
				],
			});

			const memberUsingRole = membersWithRole.find((m) => {
				const memberRoles = m.role.split(",").map((r) => r.trim());
				return memberRoles.includes(role.role);
			});

			if (memberUsingRole) {
				const msg = DYNAMIC_ACCESS_CONTROL_ERROR_CODES.ROLE_IS_IN_USE;
				throw APIError.from("BAD_REQUEST", msg);
			}

			const deleteRoleHook = getHook("DeleteRole", options);

			await deleteRoleHook.before(
				{
					organization: org,
					role,
					user: session.user,
				},
				ctx,
			);

			try {
				await roleAdapter.deleteRole(role.id as RealRoleId);
			} catch (error) {
				ctx.context.logger.error("Failed to delete role:", error);
				const msg = DYNAMIC_ACCESS_CONTROL_ERROR_CODES.FAILED_TO_DELETE_ROLE;
				throw APIError.from("INTERNAL_SERVER_ERROR", msg);
			}

			await deleteRoleHook.after(
				{ organization: org, role, user: session.user },
				ctx,
			);

			return ctx.json({ success: true });
		},
	);
};
