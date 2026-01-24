import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import * as z from "zod/v4";
import { hasPermission } from "../../access";
import { ORGANIZATION_ERROR_CODES } from "../../helpers/error-codes";
import { getHook } from "../../helpers/get-hook";
import { getOrgAdapter } from "../../helpers/get-org-adapter";
import { resolveOrgOptions } from "../../helpers/resolve-org-options";
import { orgMiddleware, orgSessionMiddleware } from "../../middleware";
import type { Invitation } from "../../schema";
import type { OrganizationOptions } from "../../types";

const cancelInvitationBodySchema = z.object({
	invitationId: z.string().meta({
		description: "The ID of the invitation to cancel",
	}),
});

export const cancelInvitation = <O extends OrganizationOptions>(
	_options: O,
) => {
	const options = resolveOrgOptions(_options);
	return createAuthEndpoint(
		"/organization/cancel-invitation",
		{
			method: "POST",
			body: cancelInvitationBodySchema,
			requireHeaders: true,
			use: [orgMiddleware, orgSessionMiddleware],
			openapi: {
				operationId: "cancelOrganizationInvitation",
				description: "Cancel an invitation to an organization",
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
			const adapter = getOrgAdapter<O>(ctx.context, _options);
			const invitationId = ctx.body.invitationId;
			const invitation = await adapter.findInvitationById(invitationId);

			if (!invitation) {
				const code = "INVITATION_NOT_FOUND";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("BAD_REQUEST", msg);
			}

			const member = await adapter.findMemberByOrgId({
				userId: session.user.id,
				organizationId: invitation.organizationId,
			});

			if (!member) {
				const msg = ORGANIZATION_ERROR_CODES.MEMBER_NOT_FOUND;
				throw APIError.from("BAD_REQUEST", msg);
			}

			const canCancel = await hasPermission(
				{
					role: member.role,
					options: ctx.context.orgOptions,
					permissions: {
						invitation: ["cancel"],
					},
					organizationId: invitation.organizationId,
				},
				ctx,
			);

			if (!canCancel) {
				const code = "YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION";
				const msg = ORGANIZATION_ERROR_CODES[code];
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

			const cancelInvitationHooks = getHook("CancelInvitation", options);

			await cancelInvitationHooks.before(
				{
					cancelledBy: session.user,
					invitation: invitation as unknown as Invitation,
					organization,
				},
				ctx,
			);

			const canceledI = await adapter.updateInvitation({
				invitationId: ctx.body.invitationId,
				status: "canceled",
			});

			await cancelInvitationHooks.after(
				{
					invitation: (canceledI as unknown as Invitation) || invitation,
					cancelledBy: session.user,
					organization,
				},
				ctx,
			);

			return ctx.json(canceledI);
		},
	);
};
