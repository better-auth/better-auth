import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import { setSessionCookie } from "better-auth/cookies";
import * as z from "zod/v4";
import type { TeamsAddon } from "../../addons";
import { ORGANIZATION_ERROR_CODES } from "../../helpers/error-codes";
import { getAddon } from "../../helpers/get-addon";
import { getHook } from "../../helpers/get-hook";
import { getOrgAdapter } from "../../helpers/get-org-adapter";
import { resolveOrgOptions } from "../../helpers/resolve-org-options";
import { orgMiddleware, orgSessionMiddleware } from "../../middleware";
import type { Invitation } from "../../schema";
import type { OrganizationOptions } from "../../types";

const acceptInvitationBodySchema = z
	.object({
		invitationId: z
			.string()
			.meta({
				description: "The ID of the invitation to accept",
			})
			.optional(),
	})
	.optional();

const acceptInvitationQuerySchema = z
	.object({
		invitationId: z
			.string()
			.meta({
				description:
					"The ID of the invitation to accept (alternative to body parameter)",
			})
			.optional(),
	})
	.optional();

export type AcceptInvitation<O extends OrganizationOptions> = ReturnType<
	typeof acceptInvitation<O>
>;

export const acceptInvitation = <O extends OrganizationOptions>(
	_options: O,
) => {
	const options = resolveOrgOptions(_options);
	return createAuthEndpoint(
		"/organization/accept-invitation",
		{
			method: "POST",
			body: acceptInvitationBodySchema,
			query: acceptInvitationQuerySchema,
			requireHeaders: true,
			use: [orgMiddleware, orgSessionMiddleware],
			metadata: {
				$Infer: {
					body: {} as {
						invitationId?: string;
					},
				},
				openapi: {
					description:
						"Accept an invitation to an organization. The invitation ID can be provided via query parameter or request body.",
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

			const invitationId = ctx.query?.invitationId || ctx.body?.invitationId;
			if (!invitationId) {
				throw APIError.from("BAD_REQUEST", {
					message: "Invitation ID is required",
					code: "INVITATION_ID_REQUIRED",
				});
			}

			const invitation = await adapter.findInvitationById(invitationId);

			if (
				!invitation ||
				invitation.expiresAt < new Date() ||
				invitation.status !== "pending"
			) {
				const code = "INVITATION_NOT_FOUND";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("BAD_REQUEST", msg);
			}

			if (invitation.email.toLowerCase() !== session.user.email.toLowerCase()) {
				const code = "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("FORBIDDEN", msg);
			}

			if (
				ctx.context.orgOptions.requireEmailVerificationOnInvitation &&
				!session.user.emailVerified
			) {
				const code =
					"EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION";
				const msg = ORGANIZATION_ERROR_CODES[code];
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
				const code = "ORGANIZATION_NOT_FOUND";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("BAD_REQUEST", msg);
			}

			const limit = await membershipLimit(session.user, organization, ctx);

			if (membersCount >= limit) {
				const code = "ORGANIZATION_MEMBERSHIP_LIMIT_REACHED";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("FORBIDDEN", msg);
			}

			const acceptInvitationHooks = getHook("AcceptInvitation");

			await acceptInvitationHooks.before(
				{
					invitation: invitation as unknown as Invitation,
					user: session.user,
					organization,
				},
				ctx,
			);

			const acceptedI = await adapter.updateInvitation({
				invitationId,
				status: "accepted",
			});
			if (!acceptedI) {
				const code = "FAILED_TO_RETRIEVE_INVITATION";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("BAD_REQUEST", msg);
			}

			// Team support: add user to teams if teams addon is enabled and invitation has teamId
			const [teamsAddon] = getAddon(options, "teams", {} as TeamsAddon);
			if (teamsAddon && "teamId" in acceptedI && acceptedI.teamId) {
				const { updatedSession } = await teamsAddon.events.acceptInvitation(
					{
						invitation: acceptedI as Invitation & { teamId: string },
						user: session.user,
						session: session.session,
						organizationId: invitation.organizationId,
						setActiveTeam: adapter.setActiveTeam,
					},
					ctx.context,
				);

				if (updatedSession) {
					await setSessionCookie(ctx, {
						session: updatedSession,
						user: session.user,
					});
				}
			}

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
				const code = "INVITATION_NOT_FOUND";
				const msg = ORGANIZATION_ERROR_CODES[code];
				return ctx.json(null, {
					status: 400,
					body: {
						message: msg.message,
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
				organization,
			});
		},
	);
};
