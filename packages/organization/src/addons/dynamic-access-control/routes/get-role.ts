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
import { getAdapter } from "../helpers/get-adapter";
import { resolveOptions } from "../helpers/resolve-options";
import type { DynamicAccessControlOptions } from "../types";

const getRoleQuerySchema = z.object({
	roleId: z
		.string()
		.meta({
			description: "The ID of the role to retrieve",
		})
		.optional(),
	roleName: z
		.string()
		.meta({
			description: "The name of the role to retrieve",
		})
		.optional(),
	organizationId: z
		.string()
		.meta({
			description:
				"The organization ID which the role belongs to. If not provided, defaults to the active organization.",
		})
		.optional(),
});

export const getRole = <O extends DynamicAccessControlOptions>(
	_options?: O | undefined,
) => {
	const options = resolveOptions(_options);

	return createAuthEndpoint(
		"/organization/get-role",
		{
			method: "GET",
			query: getRoleQuerySchema,
			requireHeaders: true,
			use: [orgMiddleware],
			metadata: {
				openapi: {
					operationId: "getOrganizationRole",
					description: "Get a role by its ID or name",
					responses: {
						"200": {
							description: "Role retrieved successfully",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											id: {
												type: "string",
												description: "Unique identifier of the role",
											},
											role: {
												type: "string",
												description: "Name of the role",
											},
											organizationId: {
												type: "string",
												description:
													"ID of the organization the role belongs to",
											},
											permissions: {
												type: "object",
												description: "Permissions for the role",
											},
											createdAt: {
												type: "string",
												format: "date-time",
												description: "Timestamp when the role was created",
											},
											updatedAt: {
												type: "string",
												format: "date-time",
												description: "Timestamp when the role was last updated",
											},
										},
										required: [
											"id",
											"role",
											"organizationId",
											"permissions",
											"createdAt",
										],
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
			const organizationId = await getOrganizationId({ ctx });
			const realOrgId = await orgAdapter.getRealOrganizationId(organizationId);

			const member = await orgAdapter.findMemberByOrgId({
				userId: session.user.id,
				organizationId: realOrgId,
			});

			if (!member) {
				const code = "YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("FORBIDDEN", msg);
			}

			const canReadRole = await hasPermission(
				{
					role: member.role,
					options: ctx.context.orgOptions,
					permissions: {
						ac: ["read"],
					},
					organizationId: realOrgId,
				},
				ctx,
			);

			if (!canReadRole) {
				const code = "YOU_ARE_NOT_ALLOWED_TO_READ_A_ROLE";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("FORBIDDEN", msg);
			}

			if (!ctx.query.roleId && !ctx.query.roleName) {
				throw APIError.from("BAD_REQUEST", {
					code: "INVALID_REQUEST",
					message: "Either roleId or roleName must be provided",
				});
			}

			let role: Awaited<ReturnType<typeof roleAdapter.findRoleById>> = null;
			if (ctx.query.roleId) {
				role = await roleAdapter.findRoleById({
					roleId: ctx.query.roleId,
					organizationId: realOrgId,
				});
			} else if (ctx.query.roleName) {
				role = await roleAdapter.findRoleByName({
					roleName: ctx.query.roleName,
					organizationId: realOrgId,
				});
			}

			if (!role) {
				const msg = DYNAMIC_ACCESS_CONTROL_ERROR_CODES.ROLE_NOT_FOUND;
				throw APIError.from("BAD_REQUEST", msg);
			}

			return ctx.json(role);
		},
	);
};
