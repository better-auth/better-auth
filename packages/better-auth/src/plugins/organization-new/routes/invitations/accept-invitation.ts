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

const acceptInvitationBodySchema = z.object({
	invitationId: z.string().meta({
		description: "The ID of the invitation to accept",
	}),
});

export const acceptInvitation = <O extends OrganizationOptions>(
	_options: O,
) => {
	const options = resolveOrgOptions(_options);
	return createAuthEndpoint(
		"/organization/accept-invitation",
		{
			method: "POST",
			body: acceptInvitationBodySchema,
			requireHeaders: true,
			use: [orgMiddleware, orgSessionMiddleware],
			metadata: {
				openapi: {
					description: "Accept an invitation to an organization",
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
			const adapter = getOrgAdapter<O>(ctx.context, _options);
			const invitation = await adapter.findInvitationById(
				ctx.body.invitationId,
			);

			if (
				!invitation ||
				invitation.expiresAt < new Date() ||
				invitation.status !== "pending"
			) {
				const msg = ORGANIZATION_ERROR_CODES.INVITATION_NOT_FOUND;
				throw APIError.from("BAD_REQUEST", msg);
			}

			if (invitation.email.toLowerCase() !== session.user.email.toLowerCase()) {
				const msg =
					ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION;
				throw APIError.from("FORBIDDEN", msg);
			}

			if (
				ctx.context.orgOptions.requireEmailVerificationOnInvitation &&
				!session.user.emailVerified
			) {
				const msg =
					ORGANIZATION_ERROR_CODES.EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION;
				throw APIError.from("FORBIDDEN", msg);
			}

			const membershipLimit = options.membershipLimit;
			const membersCount = await adapter.countMembers({
				organizationId: invitation.organizationId,
			});

			const organizationId = invitation.organizationId;
			const organization = await adapter.findOrganizationById(
				organizationId,
				"id",
			);
			if (!organization) {
				const msg = ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND;
				throw APIError.from("BAD_REQUEST", msg);
			}

			const limit = await membershipLimit(session.user, organization, ctx);

			if (membersCount >= limit) {
				const msg =
					ORGANIZATION_ERROR_CODES.ORGANIZATION_MEMBERSHIP_LIMIT_REACHED;
				throw APIError.from("FORBIDDEN", msg);
			}

			const acceptInvitationHooks = getHook("AcceptInvitation", options);

			await acceptInvitationHooks.before(
				{
					invitation: invitation as unknown as Invitation,
					user: session.user,
					organization,
				},
				ctx,
			);

			const acceptedI = await adapter.updateInvitation({
				invitationId: ctx.body.invitationId,
				status: "accepted",
			});
			if (!acceptedI) {
				const msg = ORGANIZATION_ERROR_CODES.FAILED_TO_RETRIEVE_INVITATION;
				throw APIError.from("BAD_REQUEST", msg);
			}

			// TODO: Team support not implemented yet
			// if (
			// 	ctx.context.orgOptions.teams &&
			// 	ctx.context.orgOptions.teams.enabled &&
			// 	"teamId" in acceptedI &&
			// 	acceptedI.teamId
			// ) {
			// 	const teamIds = (acceptedI.teamId as string).split(",");
			// 	const onlyOne = teamIds.length === 1;

			// 	for (const teamId of teamIds) {
			// 		await adapter.findOrCreateTeamMember({
			// 			teamId: teamId,
			// 			userId: session.user.id,
			// 		});

			// 		if (
			// 			typeof ctx.context.orgOptions.teams.maximumMembersPerTeam !==
			// 			"undefined"
			// 		) {
			// 			const members = await adapter.countTeamMembers({ teamId });

			// 			const maximumMembersPerTeam =
			// 				typeof ctx.context.orgOptions.teams.maximumMembersPerTeam ===
			// 				"function"
			// 					? await ctx.context.orgOptions.teams.maximumMembersPerTeam({
			// 							teamId,
			// 							session: session,
			// 							organizationId: invitation.organizationId,
			// 						})
			// 					: ctx.context.orgOptions.teams.maximumMembersPerTeam;

			// 			if (members >= maximumMembersPerTeam) {
			// 				throw APIError.from(
			// 					"FORBIDDEN",
			// 					ORGANIZATION_ERROR_CODES.TEAM_MEMBER_LIMIT_REACHED,
			// 				);
			// 			}
			// 		}
			// 	}

			// 	if (onlyOne) {
			// 		const teamId = teamIds[0]!;
			// 		const updatedSession = await adapter.setActiveTeam(
			// 			session.session.token,
			// 			teamId,
			// 			ctx,
			// 		);

			// 		await setSessionCookie(ctx, {
			// 			session: updatedSession,
			// 			user: session.user,
			// 		});
			// 	}
			// }

			const member = await adapter.createMember({
				organizationId: invitation.organizationId,
				userId: session.user.id,
				role: invitation.role,
				createdAt: new Date(),
			});

			await adapter.setActiveOrganization(
				session.session.token,
				invitation.organizationId,
			);

			if (!acceptedI) {
				const message = ORGANIZATION_ERROR_CODES.INVITATION_NOT_FOUND.message;
				return ctx.json(null, {
					status: 400,
					body: {
						message: message,
					},
				});
			}

			await acceptInvitationHooks.after(
				{
					invitation: acceptedI as unknown as Invitation,
					member,
					user: session.user,
					organization,
				},
				ctx,
			);

			return ctx.json({
				invitation: acceptedI,
				member,
			});
		},
	);
};
