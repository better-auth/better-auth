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

const acceptInvitationCallbackQuerySchema = z.object({
	invitationId: z.string().meta({
		description: "The ID of the invitation to accept",
	}),
	callbackURL: z
		.string()
		.meta({
			description: "The URL to redirect to after accepting the invitation",
		})
		.optional(),
});

export type AcceptInvitationCallback<O extends OrganizationOptions> =
	ReturnType<typeof acceptInvitationCallback<O>>;

export const acceptInvitationCallback = <O extends OrganizationOptions>(
	_options: O,
) => {
	const options = resolveOrgOptions(_options);

	return createAuthEndpoint(
		"/organization/accept-invitation-callback",
		{
			method: "GET",
			query: acceptInvitationCallbackQuerySchema,
			requireHeaders: true,
			use: [orgMiddleware, orgSessionMiddleware],
			metadata: {
				openapi: {
					operationId: "acceptOrganizationInvitationCallback",
					description:
						"Callback endpoint for accepting an invitation via URL. Accepts the invitation and redirects to the callback URL.",
					parameters: [
						{
							name: "invitationId",
							in: "query",
							description: "The ID of the invitation to accept",
							required: true,
							schema: {
								type: "string",
							},
						},
						{
							name: "callbackURL",
							in: "query",
							description:
								"The URL to redirect to after accepting the invitation",
							required: false,
							schema: {
								type: "string",
							},
						},
					],
					responses: {
						"302": {
							description:
								"Redirect to callback URL after successful acceptance",
						},
					},
				},
			},
		},
		async (ctx) => {
			const { invitationId, callbackURL } = ctx.query;
			const session = ctx.context.session;
			const adapter = getOrgAdapter<O>(ctx.context, _options);

			// Helper function to redirect with error
			function redirectOnError(error: { code: string; message: string }) {
				if (callbackURL) {
					const url = new URL(callbackURL);
					url.searchParams.set("error", error.code);
					throw ctx.redirect(url.toString());
				}
				throw APIError.from("BAD_REQUEST", error);
			}

			const invitation = await adapter.findInvitationById(invitationId);

			if (
				!invitation ||
				invitation.expiresAt < new Date() ||
				invitation.status !== "pending"
			) {
				return redirectOnError(ORGANIZATION_ERROR_CODES.INVITATION_NOT_FOUND);
			}

			if (invitation.email.toLowerCase() !== session.user.email.toLowerCase()) {
				const code = "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION";
				const msg = ORGANIZATION_ERROR_CODES[code];
				return redirectOnError(msg);
			}

			if (
				ctx.context.orgOptions.requireEmailVerificationOnInvitation &&
				!session.user.emailVerified
			) {
				const code =
					"EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION";
				const msg = ORGANIZATION_ERROR_CODES[code];
				return redirectOnError(msg);
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
				return redirectOnError(msg);
			}

			const limit = await membershipLimit(session.user, organization, ctx);

			if (membersCount >= limit) {
				const code = "ORGANIZATION_MEMBERSHIP_LIMIT_REACHED";
				const msg = ORGANIZATION_ERROR_CODES[code];
				return redirectOnError(msg);
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
				invitationId,
				status: "accepted",
			});
			if (!acceptedI) {
				const code = "FAILED_TO_RETRIEVE_INVITATION";
				const msg = ORGANIZATION_ERROR_CODES[code];
				return redirectOnError(msg);
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

			await acceptInvitationHooks.after(
				{
					invitation: acceptedI as unknown as Invitation,
					member,
					user: session.user,
					organization,
				},
				ctx,
			);

			// Redirect to callback URL on success
			if (callbackURL) {
				throw ctx.redirect(callbackURL);
			}

			// If no callback URL, return JSON response
			return ctx.json({
				invitation: acceptedI,
				member,
				organization,
			});
		},
	);
};
