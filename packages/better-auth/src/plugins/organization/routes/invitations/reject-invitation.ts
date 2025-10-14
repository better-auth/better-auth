import * as z from "zod";
import { createAuthEndpoint } from "@better-auth/core/middleware";
import { getOrgAdapter } from "../../adapter";
import { orgMiddleware, orgSessionMiddleware } from "../../call";
import { type Invitation } from "../../schema";
import { APIError } from "better-call";
import { type OrganizationOptions } from "../../types";
import { ORGANIZATION_ERROR_CODES } from "../../error-codes";

export const rejectInvitation = <O extends OrganizationOptions>(options: O) =>
	createAuthEndpoint(
		"/organization/reject-invitation",
		{
			method: "POST",
			body: z.object({
				invitationId: z.string().meta({
					description: "The ID of the invitation to reject",
				}),
			}),
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
												type: "null",
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
			if (
				!invitation ||
				invitation.expiresAt < new Date() ||
				invitation.status !== "pending"
			) {
				throw new APIError("BAD_REQUEST", {
					message: "Invitation not found!",
				});
			}
			if (invitation.email.toLowerCase() !== session.user.email.toLowerCase()) {
				throw new APIError("FORBIDDEN", {
					message:
						ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION,
				});
			}

			if (
				ctx.context.orgOptions.requireEmailVerificationOnInvitation &&
				!session.user.emailVerified
			) {
				throw new APIError("FORBIDDEN", {
					message:
						ORGANIZATION_ERROR_CODES.EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION,
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

			// Run beforeRejectInvitation hook
			if (options?.organizationHooks?.beforeRejectInvitation) {
				await options?.organizationHooks.beforeRejectInvitation({
					invitation: invitation as unknown as Invitation,
					user: session.user,
					organization,
				});
			}

			const rejectedI = await adapter.updateInvitation({
				invitationId: ctx.body.invitationId,
				status: "rejected",
			});

			// Run afterRejectInvitation hook
			if (options?.organizationHooks?.afterRejectInvitation) {
				await options?.organizationHooks.afterRejectInvitation({
					invitation: rejectedI || (invitation as unknown as Invitation),
					user: session.user,
					organization,
				});
			}

			return ctx.json({
				invitation: rejectedI,
				member: null,
			});
		},
	);
