import * as z from "zod";
import { createAuthEndpoint } from "@better-auth/core/middleware";
import { getOrgAdapter } from "../../adapter";
import { orgMiddleware, orgSessionMiddleware } from "../../call";
import { type Invitation } from "../../schema";
import { APIError } from "better-call";
import { type OrganizationOptions } from "../../types";
import { ORGANIZATION_ERROR_CODES } from "../../error-codes";
import { setSessionCookie } from "../../../../cookies";

export const acceptInvitation = <O extends OrganizationOptions>(options: O) =>
	createAuthEndpoint(
		"/organization/accept-invitation",
		{
			method: "POST",
			body: z.object({
				invitationId: z.string().meta({
					description: "The ID of the invitation to accept",
				}),
			}),
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
			const adapter = getOrgAdapter<O>(ctx.context, options);
			const invitation = await adapter.findInvitationById(
				ctx.body.invitationId,
			);

			if (
				!invitation ||
				invitation.expiresAt < new Date() ||
				invitation.status !== "pending"
			) {
				if (invitation && invitation.expiresAt < new Date()) {
					throw new APIError("BAD_REQUEST", {
						message: ORGANIZATION_ERROR_CODES.INVITATION_EXPIRED,
					});
				}

				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.INVITATION_NOT_FOUND,
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

			const membershipLimit = ctx.context.orgOptions?.membershipLimit || 100;
			const membersCount = await adapter.countMembers({
				organizationId: invitation.organizationId,
			});

			if (membersCount >= membershipLimit) {
				throw new APIError("FORBIDDEN", {
					message:
						ORGANIZATION_ERROR_CODES.ORGANIZATION_MEMBERSHIP_LIMIT_REACHED,
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

			// Run beforeAcceptInvitation hook
			if (options?.organizationHooks?.beforeAcceptInvitation) {
				await options?.organizationHooks.beforeAcceptInvitation({
					invitation: invitation as unknown as Invitation,
					user: session.user,
					organization,
				});
			}

			const acceptedI = await adapter.updateInvitation({
				invitationId: ctx.body.invitationId,
				status: "accepted",
			});
			if (!acceptedI) {
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.FAILED_TO_RETRIEVE_INVITATION,
				});
			}
			if (
				ctx.context.orgOptions.teams &&
				ctx.context.orgOptions.teams.enabled &&
				"teamId" in acceptedI &&
				acceptedI.teamId
			) {
				const teamIds = (acceptedI.teamId as string).split(",");
				const onlyOne = teamIds.length === 1;

				for (const teamId of teamIds) {
					await adapter.findOrCreateTeamMember({
						teamId: teamId,
						userId: session.user.id,
					});

					if (
						typeof ctx.context.orgOptions.teams.maximumMembersPerTeam !==
						"undefined"
					) {
						const members = await adapter.countTeamMembers({ teamId });

						const maximumMembersPerTeam =
							typeof ctx.context.orgOptions.teams.maximumMembersPerTeam ===
							"function"
								? await ctx.context.orgOptions.teams.maximumMembersPerTeam({
										teamId,
										session: session,
										organizationId: invitation.organizationId,
									})
								: ctx.context.orgOptions.teams.maximumMembersPerTeam;

						if (members >= maximumMembersPerTeam) {
							throw new APIError("FORBIDDEN", {
								message: ORGANIZATION_ERROR_CODES.TEAM_MEMBER_LIMIT_REACHED,
							});
						}
					}
				}

				if (onlyOne) {
					const teamId = teamIds[0];
					const updatedSession = await adapter.setActiveTeam(
						session.session.token,
						teamId ?? null,
						ctx,
					);

					await setSessionCookie(ctx, {
						session: updatedSession,
						user: session.user,
					});
				}
			}

			const member = await adapter.createMember({
				organizationId: invitation.organizationId,
				userId: session.user.id,
				role: invitation.role as string,
				createdAt: new Date(),
			});

			await adapter.setActiveOrganization(
				session.session.token,
				invitation.organizationId,
				ctx,
			);
			if (!acceptedI) {
				return ctx.json(null, {
					status: 400,
					body: {
						message: ORGANIZATION_ERROR_CODES.INVITATION_NOT_FOUND,
					},
				});
			}
			if (options?.organizationHooks?.afterAcceptInvitation) {
				await options?.organizationHooks.afterAcceptInvitation({
					invitation: acceptedI as unknown as Invitation,
					member,
					user: session.user,
					organization,
				});
			}
			return ctx.json({
				invitation: acceptedI,
				member,
			});
		},
	);
