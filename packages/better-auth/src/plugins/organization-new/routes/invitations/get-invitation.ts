import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import * as z from "zod/v4";
import { getSessionFromCtx } from "../../../../api";
import { ORGANIZATION_ERROR_CODES } from "../../helpers/error-codes";
import { getOrgAdapter } from "../../helpers/get-org-adapter";
import { orgMiddleware } from "../../middleware";
import type { OrganizationOptions } from "../../types";

const getInvitationQuerySchema = z.object({
	id: z.string().meta({
		description: "The ID of the invitation to get",
	}),
});

export type GetInvitation<O extends OrganizationOptions> = ReturnType<
	typeof getInvitation<O>
>;

export const getInvitation = <O extends OrganizationOptions>(options: O) => {
	return createAuthEndpoint(
		"/organization/get-invitation",
		{
			method: "GET",
			use: [orgMiddleware],
			requireHeaders: true,
			query: getInvitationQuerySchema,
			metadata: {
				openapi: {
					description: "Get an invitation by ID",
					responses: {
						"200": {
							description: "Success",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											id: {
												type: "string",
											},
											email: {
												type: "string",
											},
											role: {
												type: "string",
											},
											organizationId: {
												type: "string",
											},
											inviterId: {
												type: "string",
											},
											status: {
												type: "string",
											},
											expiresAt: {
												type: "string",
											},
											organizationName: {
												type: "string",
											},
											organizationSlug: {
												type: "string",
											},
											inviterEmail: {
												type: "string",
											},
										},
										required: [
											"id",
											"email",
											"role",
											"organizationId",
											"inviterId",
											"status",
											"expiresAt",
											"organizationName",
											"organizationSlug",
											"inviterEmail",
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
			const adapter = getOrgAdapter<O>(ctx.context, options);
			const invitation = await adapter.findInvitationById(ctx.query.id);
			if (
				!invitation ||
				invitation.status !== "pending" ||
				invitation.expiresAt < new Date()
			) {
				throw APIError.fromStatus("BAD_REQUEST", {
					message: "Invitation not found!",
				});
			}
			if (invitation.email.toLowerCase() !== session.user.email.toLowerCase()) {
				const code = "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("FORBIDDEN", msg);
			}
			const organizationId = invitation.organizationId;
			const organization = await adapter.findOrganizationById(
				organizationId,
				"id",
			);
			if (!organization) {
				const code = "ORGANIZATION_NOT_FOUND";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("BAD_REQUEST", msg);
			}

			const member = await adapter.findMemberAndUserByOrgId({
				userId: invitation.inviterId,
				organizationId: invitation.organizationId,
			});

			if (!member) {
				const code = "INVITER_IS_NO_LONGER_A_MEMBER_OF_THE_ORGANIZATION";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("BAD_REQUEST", msg);
			}

			return ctx.json({
				...invitation,
				organizationName: organization.name,
				...("slug" in organization
					? { organizationSlug: organization.slug }
					: {}),
				inviterEmail: member.user.email,
			});
		},
	);
};
