import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import * as z from "zod";
import { ORGANIZATION_ERROR_CODES } from "../../helpers/error-codes";
import { getOrgAdapter } from "../../helpers/get-org-adapter";
import { getOrganizationId } from "../../helpers/get-organization-id";
import { orgMiddleware, orgSessionMiddleware } from "../../middleware";
import type { OrganizationOptions } from "../../types";

const getActiveMemberRoleQuerySchema = z
	.object({
		userId: z
			.string()
			.meta({
				description:
					"The user ID to get the role for. If not provided, will default to the current user's",
			})
			.optional(),
		organizationId: z
			.string()
			.meta({
				description:
					"The organization ID to get the member's role from. If not provided, will default to the user's active organization. Eg: \"organization-id\"",
			})
			.optional(),
	})
	.optional();

export type GetActiveMemberRole<O extends OrganizationOptions> = ReturnType<
	typeof getActiveMemberRole<O>
>;

export const getActiveMemberRole = <O extends OrganizationOptions>(
	options: O,
) =>
	createAuthEndpoint(
		"/organization/get-active-member-role",
		{
			method: "GET",
			query: getActiveMemberRoleQuerySchema,
			requireHeaders: true,
			use: [orgMiddleware, orgSessionMiddleware],
			metadata: {
				openapi: {
					operationId: "getActiveOrganizationMemberRole",
					description:
						"Get the role of a member in an organization. If no userId is provided, returns the current user's role.",
					responses: {
						"200": {
							description: "Success",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											role: {
												type: "string",
											},
										},
										required: ["role"],
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
			const adapter = getOrgAdapter<O>(ctx.context, options);

			const organizationId = await getOrganizationId({ ctx });
			const realOrgId = await adapter.getRealOrganizationId(organizationId);

			const isMember = await adapter.findMemberByOrgId({
				userId: session.user.id,
				organizationId: realOrgId,
			});

			if (!isMember) {
				const code = "YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("FORBIDDEN", msg);
			}

			if (!ctx.query?.userId) {
				return ctx.json({
					role: isMember.role,
				});
			}

			const userIdToGetRole = ctx.query?.userId;
			const member = await adapter.findMemberByOrgId({
				userId: userIdToGetRole,
				organizationId: realOrgId,
			});

			if (!member) {
				const code = "YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("FORBIDDEN", msg);
			}

			return ctx.json({
				role: member?.role,
			});
		},
	);
