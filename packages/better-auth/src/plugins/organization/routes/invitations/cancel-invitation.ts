import * as z from "zod";
import { createAuthEndpoint } from "@better-auth/core/middleware";
import { getOrgAdapter } from "../../adapter";
import { orgMiddleware, orgSessionMiddleware } from "../../call";
import { type Invitation } from "../../schema";
import { APIError } from "better-call";
import { type OrganizationOptions } from "../../types";
import { ORGANIZATION_ERROR_CODES } from "../../error-codes";
import { hasPermission } from "../../has-permission";

export const cancelInvitation = <O extends OrganizationOptions>(options: O) =>
	createAuthEndpoint(
		"/organization/cancel-invitation",
		{
			method: "POST",
			body: z.object({
				invitationId: z.string().meta({
					description: "The ID of the invitation to cancel",
				}),
			}),
			use: [orgMiddleware, orgSessionMiddleware],
			openapi: {
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
			const adapter = getOrgAdapter<O>(ctx.context, options);
			const invitation = await adapter.findInvitationById(
				ctx.body.invitationId,
			);
			if (!invitation) {
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.INVITATION_NOT_FOUND,
				});
			}
			const member = await adapter.findMemberByOrgId({
				userId: session.user.id,
				organizationId: invitation.organizationId,
			});
			if (!member) {
				throw new APIError("FORBIDDEN", {
					message: ORGANIZATION_ERROR_CODES.NOT_A_MEMBER_OF_THIS_ORGANIZATION,
				});
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
				throw new APIError("FORBIDDEN", {
					message:
						ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION,
				});
			}

			const organization = await adapter.findOrganizationById(
				invitation.organizationId,
			);
			if (!organization) {
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND,
				});
			}

			// Run beforeCancelInvitation hook
			if (options?.organizationHooks?.beforeCancelInvitation) {
				await options?.organizationHooks.beforeCancelInvitation({
					invitation: invitation as unknown as Invitation,
					cancelledBy: session.user,
					organization,
				});
			}

			const canceledI = await adapter.updateInvitation({
				invitationId: ctx.body.invitationId,
				status: "canceled",
			});

			// Run afterCancelInvitation hook
			if (options?.organizationHooks?.afterCancelInvitation) {
				await options?.organizationHooks.afterCancelInvitation({
					invitation: (canceledI as unknown as Invitation) || invitation,
					cancelledBy: session.user,
					organization,
				});
			}

			return ctx.json(canceledI);
		},
	);
