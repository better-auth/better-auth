import { z } from "zod";
import { createAuthEndpoint } from "../../../api/call";
import { getSessionFromCtx } from "../../../api/routes";
import { getOrgAdapter } from "../adapter";
import { orgMiddleware, orgSessionMiddleware } from "../call";
import { type InferRolesFromOption } from "../schema";
import { APIError } from "better-call";
import type { OrganizationOptions } from "../organization";

export const createInvitation = <O extends OrganizationOptions | undefined>(
	option: O,
) =>
	createAuthEndpoint(
		"/organization/invite-member",
		{
			method: "POST",
			use: [orgMiddleware, orgSessionMiddleware],
			body: z.object({
				email: z.string(),
				role: z.string() as unknown as InferRolesFromOption<O>,
				organizationId: z.string().optional(),
				resend: z.boolean().optional(),
			}),
		},
		async (ctx) => {
			if (!ctx.context.orgOptions.sendInvitationEmail) {
				ctx.context.logger.warn(
					"Invitation email is not enabled. Pass `sendInvitationEmail` to the plugin options to enable it.",
				);
				throw new APIError("BAD_REQUEST", {
					message: "Invitation email is not enabled",
				});
			}

			const session = ctx.context.session;
			const organizationId =
				ctx.body.organizationId || session.session.activeOrganizationId;
			if (!organizationId) {
				throw new APIError("BAD_REQUEST", {
					message: "Organization not found",
				});
			}
			const adapter = getOrgAdapter(ctx.context, ctx.context.orgOptions);
			const member = await adapter.findMemberByOrgId({
				userId: session.user.id,
				organizationId: organizationId,
			});
			if (!member) {
				throw new APIError("BAD_REQUEST", {
					message: "Member not found!",
				});
			}
			const role = ctx.context.roles[member.role];
			if (!role) {
				throw new APIError("BAD_REQUEST", {
					message: "Role not found!",
				});
			}
			const canInvite = role.authorize({
				invitation: ["create"],
			});
			if (canInvite.error) {
				throw new APIError("FORBIDDEN", {
					message: "You are not allowed to invite members",
				});
			}
			const alreadyMember = await adapter.findMemberByEmail({
				email: ctx.body.email,
				organizationId: organizationId,
			});
			if (alreadyMember) {
				throw new APIError("BAD_REQUEST", {
					message: "User is already a member of this organization",
				});
			}
			const alreadyInvited = await adapter.findPendingInvitation({
				email: ctx.body.email,
				organizationId: organizationId,
			});
			if (alreadyInvited.length && !ctx.body.resend) {
				throw new APIError("BAD_REQUEST", {
					message: "User is already invited to this organization",
				});
			}
			const invitation = await adapter.createInvitation({
				invitation: {
					role: ctx.body.role as string,
					email: ctx.body.email,
					organizationId: organizationId,
				},
				user: session.user,
			});

			const organization = await adapter.findOrganizationById(organizationId);

			if (!organization) {
				throw new APIError("BAD_REQUEST", {
					message: "Organization not found",
				});
			}

			await ctx.context.orgOptions.sendInvitationEmail?.(
				{
					id: invitation.id,
					role: invitation.role as string,
					email: invitation.email,
					organization: organization,
					inviter: {
						...member,
						user: session.user,
					},
				},
				ctx.request,
			);
			return ctx.json(invitation);
		},
	);

export const acceptInvitation = createAuthEndpoint(
	"/organization/accept-invitation",
	{
		method: "POST",
		body: z.object({
			invitationId: z.string(),
		}),
		use: [orgMiddleware, orgSessionMiddleware],
	},
	async (ctx) => {
		const session = ctx.context.session;
		const adapter = getOrgAdapter(ctx.context, ctx.context.orgOptions);
		const invitation = await adapter.findInvitationById(ctx.body.invitationId);
		if (
			!invitation ||
			invitation.expiresAt < new Date() ||
			invitation.status !== "pending"
		) {
			throw new APIError("BAD_REQUEST", {
				message: "Invitation not found!",
			});
		}
		if (invitation.email !== session.user.email) {
			throw new APIError("FORBIDDEN", {
				message: "You are not the recipient of the invitation",
			});
		}
		const acceptedI = await adapter.updateInvitation({
			invitationId: ctx.body.invitationId,
			status: "accepted",
		});
		const member = await adapter.createMember({
			organizationId: invitation.organizationId,
			userId: session.user.id,
			role: invitation.role,
			createdAt: new Date(),
		});
		await adapter.setActiveOrganization(
			session.session.id,
			invitation.organizationId,
		);
		if (!acceptedI) {
			return ctx.json(null, {
				status: 400,
				body: {
					message: "Invitation not found!",
				},
			});
		}
		return ctx.json({
			invitation: acceptedI,
			member,
		});
	},
);
export const rejectInvitation = createAuthEndpoint(
	"/organization/reject-invitation",
	{
		method: "POST",
		body: z.object({
			invitationId: z.string(),
		}),
		use: [orgMiddleware, orgSessionMiddleware],
	},
	async (ctx) => {
		const session = ctx.context.session;
		const adapter = getOrgAdapter(ctx.context, ctx.context.orgOptions);
		const invitation = await adapter.findInvitationById(ctx.body.invitationId);
		if (
			!invitation ||
			invitation.expiresAt < new Date() ||
			invitation.status !== "pending"
		) {
			throw new APIError("BAD_REQUEST", {
				message: "Invitation not found!",
			});
		}
		if (invitation.email !== session.user.email) {
			throw new APIError("FORBIDDEN", {
				message: "You are not the recipient of the invitation",
			});
		}
		const rejectedI = await adapter.updateInvitation({
			invitationId: ctx.body.invitationId,
			status: "rejected",
		});
		return ctx.json({
			invitation: rejectedI,
			member: null,
		});
	},
);

export const cancelInvitation = createAuthEndpoint(
	"/organization/cancel-invitation",
	{
		method: "POST",
		body: z.object({
			invitationId: z.string(),
		}),
		use: [orgMiddleware, orgSessionMiddleware],
	},
	async (ctx) => {
		const session = ctx.context.session;
		const adapter = getOrgAdapter(ctx.context, ctx.context.orgOptions);
		const invitation = await adapter.findInvitationById(ctx.body.invitationId);
		if (!invitation) {
			throw new APIError("BAD_REQUEST", {
				message: "Invitation not found!",
			});
		}
		const member = await adapter.findMemberByOrgId({
			userId: session.user.id,
			organizationId: invitation.organizationId,
		});
		if (!member) {
			throw new APIError("BAD_REQUEST", {
				message: "Member not found!",
			});
		}
		const canCancel = ctx.context.roles[member.role].authorize({
			invitation: ["cancel"],
		});
		if (canCancel.error) {
			throw new APIError("FORBIDDEN", {
				message: "You are not allowed to cancel this invitation",
			});
		}
		const canceledI = await adapter.updateInvitation({
			invitationId: ctx.body.invitationId,
			status: "canceled",
		});
		return ctx.json(canceledI);
	},
);

export const getInvitation = createAuthEndpoint(
	"/organization/get-invitation",
	{
		method: "GET",
		use: [orgMiddleware],
		requireHeaders: true,
		query: z.object({
			id: z.string(),
		}),
	},
	async (ctx) => {
		const session = await getSessionFromCtx(ctx);
		if (!session) {
			throw new APIError("UNAUTHORIZED", {
				message: "Not authenticated",
			});
		}
		const adapter = getOrgAdapter(ctx.context, ctx.context.orgOptions);
		const invitation = await adapter.findInvitationById(ctx.query.id);
		if (
			!invitation ||
			invitation.status !== "pending" ||
			invitation.expiresAt < new Date()
		) {
			throw new APIError("BAD_REQUEST", {
				message: "Invitation not found!",
			});
		}
		if (invitation.email !== session.user.email) {
			throw new APIError("FORBIDDEN", {
				message: "You are not the recipient of the invitation",
			});
		}
		const organization = await adapter.findOrganizationById(
			invitation.organizationId,
		);
		if (!organization) {
			throw new APIError("BAD_REQUEST", {
				message: "Organization not found",
			});
		}
		const member = await adapter.findMemberByOrgId({
			userId: invitation.inviterId,
			organizationId: invitation.organizationId,
		});
		if (!member) {
			throw new APIError("BAD_REQUEST", {
				message: "Inviter is no longer a member of the organization",
			});
		}

		return ctx.json({
			...invitation,
			organizationName: organization.name,
			organizationSlug: organization.slug,
			inviterEmail: member.user.email,
		});
	},
);
