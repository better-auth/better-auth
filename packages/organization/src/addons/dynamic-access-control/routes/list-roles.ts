import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import { getSessionFromCtx } from "better-auth/api";
import * as z from "zod/v4";
import { hasPermission } from "../../../access";
import { ORGANIZATION_ERROR_CODES } from "../../../helpers/error-codes";
import { getOrgAdapter } from "../../../helpers/get-org-adapter";
import { getOrganizationId } from "../../../helpers/get-organization-id";
import { orgMiddleware } from "../../../middleware/org-middleware";
import { getAdapter } from "../helpers/get-adapter";
import { resolveOptions } from "../helpers/resolve-options";
import type { DynamicAccessControlOptions } from "../types";

const listRolesQuerySchema = z
	.object({
		organizationId: z
			.string()
			.meta({
				description:
					"The organization ID to list roles for. If not provided, uses the active organization.",
			})
			.optional(),
		limit: z.coerce
			.number()
			.int()
			.positive()
			.max(100)
			.meta({
				description: "Maximum number of roles to return (1-100)",
			})
			.optional(),
		offset: z.coerce
			.number()
			.int()
			.min(0)
			.meta({
				description: "Number of roles to skip for pagination",
			})
			.optional(),
		sortBy: z
			.enum(["createdAt", "role", "updatedAt"])
			.meta({
				description:
					"Field to sort by. Defaults to createdAt. Options: createdAt, role, updatedAt",
			})
			.optional(),
		sortDirection: z
			.enum(["asc", "desc"])
			.meta({
				description: "Sort direction. Defaults to desc",
			})
			.optional(),
	})
	.optional();

export const listRoles = <O extends DynamicAccessControlOptions>(
	_options?: O | undefined,
) => {
	const options = resolveOptions(_options);

	return createAuthEndpoint(
		"/organization/list-roles",
		{
			method: "GET",
			query: listRolesQuerySchema,
			requireHeaders: true,
			use: [orgMiddleware],
			metadata: {
				openapi: {
					operationId: "listOrganizationRoles",
					description: "List all roles in an organization with pagination",
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
															description:
																"Timestamp when the role was created",
														},
														updatedAt: {
															type: "string",
															format: "date-time",
															description:
																"Timestamp when the role was last updated",
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
												description:
													"Array of role objects within the organization",
											},
											total: {
												type: "number",
												description: "Total count of roles in the organization",
											},
										},
										required: ["roles", "total"],
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

			const canListRoles = await hasPermission(
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

			if (!canListRoles) {
				const code = "YOU_ARE_NOT_ALLOWED_TO_LIST_A_ROLE";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("FORBIDDEN", msg);
			}

			const result = await roleAdapter.listRoles({
				organizationId: realOrgId,
				limit: ctx.query?.limit,
				offset: ctx.query?.offset,
				sortBy: ctx.query?.sortBy,
				sortDirection: ctx.query?.sortDirection,
			});

			return ctx.json(result);
		},
	);
};
