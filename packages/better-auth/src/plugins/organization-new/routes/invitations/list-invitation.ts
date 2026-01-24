import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import * as z from "zod/v4";
import { getSessionFromCtx } from "../../../../api";
import type { RealOrganizationId } from "../../helpers/get-org-adapter";
import { getOrgAdapter } from "../../helpers/get-org-adapter";
import { getOrganizationId } from "../../helpers/get-organization-id";
import { orgMiddleware, orgSessionMiddleware } from "../../middleware";
import type { OrganizationOptions } from "../../types";

const listInvitationQuerySchema = z
	.object({
		organizationId: z
			.string()
			.meta({
				description: "The ID of the organization to list invitations for",
			})
			.optional(),
		limit: z.coerce
			.number()
			.int()
			.positive()
			.max(100)
			.meta({
				description: "Maximum number of invitations to return (1-100)",
			})
			.optional(),
		offset: z.coerce
			.number()
			.int()
			.min(0)
			.meta({
				description: "Number of invitations to skip for pagination",
			})
			.optional(),
		sortBy: z
			.enum(["createdAt", "expiresAt", "email", "status"])
			.meta({
				description:
					"Field to sort by. Defaults to createdAt. Options: createdAt, expiresAt, email, status",
			})
			.optional(),
		sortDirection: z
			.enum(["asc", "desc"])
			.meta({
				description: "Sort direction. Defaults to desc",
			})
			.optional(),
		status: z
			.enum(["pending", "accepted", "rejected", "canceled"])
			.meta({
				description: "Filter by invitation status",
			})
			.optional(),
	})
	.optional();

export const listInvitations = <O extends OrganizationOptions>(options: O) =>
	createAuthEndpoint(
		"/organization/list-invitations",
		{
			method: "GET",
			requireHeaders: true,
			use: [orgMiddleware, orgSessionMiddleware],
			query: listInvitationQuerySchema,
			metadata: {
				openapi: {
					description: "List invitations for an organization with pagination",
					responses: {
						"200": {
							description: "Success",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											invitations: {
												type: "array",
												items: {
													type: "object",
													properties: {
														id: { type: "string" },
														email: { type: "string" },
														role: { type: "string" },
														organizationId: { type: "string" },
														inviterId: { type: "string" },
														status: { type: "string" },
														expiresAt: { type: "string" },
														createdAt: { type: "string" },
													},
													required: [
														"id",
														"email",
														"role",
														"organizationId",
														"inviterId",
														"status",
														"expiresAt",
														"createdAt",
													],
												},
											},
											total: {
												type: "number",
												description: "Total count of invitations",
											},
										},
										required: ["invitations", "total"],
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
			if (!session) {
				throw APIError.fromStatus("UNAUTHORIZED", {
					message: "Not authenticated",
				});
			}
			const organization = await getOrganizationId({
				ctx,
				shouldGetOrganization: true,
			});
			const adapter = getOrgAdapter<O>(ctx.context, options);
			const isMember = await adapter.findMemberByOrgId({
				userId: session.user.id,
				organizationId: organization.id as RealOrganizationId,
			});
			if (!isMember) {
				throw APIError.fromStatus("FORBIDDEN", {
					message: "You are not a member of this organization",
				});
			}
			const result = await adapter.listInvitations({
				organizationId: organization.id as RealOrganizationId,
				limit: ctx.query?.limit,
				offset: ctx.query?.offset,
				sortBy: ctx.query?.sortBy,
				sortDirection: ctx.query?.sortDirection,
				status: ctx.query?.status,
			});
			return ctx.json(result);
		},
	);
