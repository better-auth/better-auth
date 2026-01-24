import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import * as z from "zod/v4";
import { ORGANIZATION_ERROR_CODES } from "../../helpers/error-codes";
import { getHook } from "../../helpers/get-hook";
import { getOrgAdapter } from "../../helpers/get-org-adapter";
import { resolveOrgOptions } from "../../helpers/resolve-org-options";
import { orgMiddleware, orgSessionMiddleware } from "../../middleware";
import type { Invitation } from "../../schema";
import type { OrganizationOptions } from "../../types";

const rejectInvitationBodySchema = z.object({
	invitationId: z.string().meta({
		description: "The ID of the invitation to reject",
	}),
});

export const rejectInvitation = <O extends OrganizationOptions>(
	_options: O,
) => {
	const options = resolveOrgOptions(_options);
	return createAuthEndpoint(
		"/organization/reject-invitation",
		{
			method: "POST",
			body: rejectInvitationBodySchema,
			requireHeaders: true,
			use: [orgMiddleware, orgSessionMiddleware],
			metadata: {
				openapi: {
					description: "Reject an invitation to an organization",
					responses: {
						"200": {
							description: "Success",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											invitation: {
												type: "object",
											},
											member: {
												type: "object",
												nullable: true,
											},
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
			const adapter = getOrgAdapter(ctx.context, ctx.context.orgOptions);
			const invitation = await adapter.findInvitationById(
				ctx.body.invitationId,
			);
			if (!invitation || invitation.status !== "pending") {
				const msg = ORGANIZATION_ERROR_CODES.INVITATION_NOT_FOUND;
				throw APIError.from("BAD_REQUEST", msg);
			}
			if (invitation.email.toLowerCase() !== session.user.email.toLowerCase()) {
				const code = "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("FORBIDDEN", msg);
			}

			if (
				options.requireEmailVerificationOnInvitation &&
				!session.user.emailVerified
			) {
				const msg =
					ORGANIZATION_ERROR_CODES.EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION;
				throw APIError.from("FORBIDDEN", msg);
			}

			const organizationId = invitation.organizationId;
			const organization = await adapter.findOrganizationById(
				organizationId,
				"id",
			);
			if (!organization) {
				const msg = ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND;
				throw APIError.from("BAD_REQUEST", msg);
			}

			const rejectInvitationHooks = getHook("RejectInvitation", options);

			rejectInvitationHooks.before(
				{
					invitation: invitation as unknown as Invitation,
					organization,
					user: session.user,
				},
				ctx,
			);

			const rejectedI = await adapter.updateInvitation({
				invitationId: ctx.body.invitationId,
				status: "rejected",
			});

			await rejectInvitationHooks.after(
				{
					invitation: rejectedI || (invitation as unknown as Invitation),
					user: session.user,
					organization,
				},
				ctx,
			);

			return ctx.json({
				invitation: rejectedI,
				member: null,
			});
		},
	);
};
