import { z } from "zod";
import { createAuthEndpoint } from "../../../api/call";
import { orgMiddleware, orgSessionMiddleware } from "../call";
import { getOrgAdapter } from "../adapter";
import { generateId } from "../../../utils/id";
import { role } from "../schema";
import { getSessionFromCtx } from "../../../api/routes";

export const createInvitation = createAuthEndpoint(
	"/organization/invite-member",
	{
		method: "POST",
		use: [orgMiddleware, orgSessionMiddleware],
		body: z.object({
			email: z.string(),
			role: role,
			organizationId: z.string().optional(),
			resend: z.boolean().optional(),
		}),
	},
	async (ctx) => {
		const session = ctx.context.session;
		const orgId =
			ctx.body.organizationId || session.session.activeOrganizationId;
		if (!orgId) {
			return ctx.json(null, {
				status: 400,
				body: {
					message: "Organization id not found!",
				},
			});
		}
		const adapter = getOrgAdapter(ctx.context.adapter, ctx.context.orgOptions);
		const member = await adapter.findMemberByOrgId({
			userId: session.user.id,
			organizationId: orgId,
		});
		if (!member) {
			return ctx.json(null, {
				status: 400,
				body: {
					message: "User is not a member of this organization!",
				},
			});
		}
		const role = ctx.context.roles[member.role];
		if (!role) {
			return ctx.json(null, {
				status: 400,
				body: {
					message: "Role not found!",
				},
			});
		}
		const canInvite = role.authorize({
			invitation: ["create"],
		});
		if (canInvite.error) {
			return ctx.json(null, {
				body: {
					message: "You are not allowed to invite users to this organization",
				},
				status: 403,
			});
		}
		const alreadyMember = await adapter.findMemberByEmail({
			email: ctx.body.email,
			organizationId: orgId,
		});
		if (alreadyMember) {
			return ctx.json(null, {
				status: 400,
				body: {
					message: "User is already a member of this organization",
				},
			});
		}
		const alreadyInvited = await adapter.findPendingInvitation({
			email: ctx.body.email,
			organizationId: orgId,
		});
		if (alreadyInvited.length && !ctx.body.resend) {
			return ctx.json(null, {
				status: 400,
				body: {
					message: "User is already invited to this organization",
				},
			});
		}
		const invitation = await adapter.createInvitation({
			invitation: {
				role: ctx.body.role,
				email: ctx.body.email,
				organizationId: orgId,
			},
			user: session.user,
		});
		await ctx.context.orgOptions.sendInvitationEmail?.(
			invitation,
			ctx.body.email,
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
		const adapter = getOrgAdapter(ctx.context.adapter, ctx.context.orgOptions);
		const invitation = await adapter.findInvitationById(ctx.body.invitationId);
		if (
			!invitation ||
			invitation.expiresAt < new Date() ||
			invitation.status !== "pending"
		) {
			return ctx.json(null, {
				status: 400,
				body: {
					message: "Invitation not found!",
				},
			});
		}
		if (invitation.email !== session.user.email) {
			return ctx.json(null, {
				status: 400,
				body: {
					message: "You are not the repentant of the invitation",
				},
			});
		}
		const acceptedI = await adapter.updateInvitation({
			invitationId: ctx.body.invitationId,
			status: "accepted",
		});
		const member = await adapter.createMember({
			id: generateId(),
			organizationId: invitation.organizationId,
			userId: session.user.id,
			email: invitation.email,
			role: invitation.role,
			name: session.user.name,
		});
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
		const adapter = getOrgAdapter(ctx.context.adapter, ctx.context.orgOptions);
		const invitation = await adapter.findInvitationById(ctx.body.invitationId);
		if (
			!invitation ||
			invitation.expiresAt < new Date() ||
			invitation.status !== "pending"
		) {
			return ctx.json(null, {
				status: 400,
				body: {
					message: "Invitation not found!",
				},
			});
		}
		if (invitation.email !== session.user.email) {
			return ctx.json(null, {
				status: 400,
				body: {
					message: "You are not the repentant of the invitation",
				},
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
		const adapter = getOrgAdapter(ctx.context.adapter, ctx.context.orgOptions);
		const invitation = await adapter.findInvitationById(ctx.body.invitationId);
		if (!invitation) {
			return ctx.json(null, {
				status: 400,
				body: {
					message: "Invitation not found!",
				},
			});
		}
		const member = await adapter.findMemberByOrgId({
			userId: session.user.id,
			organizationId: invitation.organizationId,
		});
		if (!member) {
			return ctx.json(null, {
				status: 400,
				body: {
					message: "User is not a member of this organization",
				},
			});
		}
		const canCancel = ctx.context.roles[member.role].authorize({
			invitation: ["cancel"],
		});
		if (canCancel.error) {
			return ctx.json(null, {
				status: 403,
				body: {
					message: "You are not allowed to cancel this invitation",
				},
			});
		}
		const canceledI = await adapter.updateInvitation({
			invitationId: ctx.body.invitationId,
			status: "canceled",
		});
		return ctx.json(canceledI);
	},
);

export const getActiveInvitation = createAuthEndpoint(
	"/organization/get-active-invitation",
	{
		method: "GET",
		use: [orgMiddleware],
		query: z.object({
			id: z.string(),
		}),
	},
	async (ctx) => {
		const session = await getSessionFromCtx(ctx);
		if (!session) {
			return ctx.json(null, {
				status: 400,
				body: {
					message: "User not logged in",
				},
			});
		}
		const adapter = getOrgAdapter(ctx.context.adapter, ctx.context.orgOptions);
		const invitation = await adapter.findInvitationById(ctx.query.id);
		if (
			!invitation ||
			invitation.status !== "pending" ||
			invitation.expiresAt < new Date()
		) {
			return ctx.json(null, {
				status: 400,
				body: {
					message: "Invitation not found!",
				},
			});
		}
		if (invitation.email !== session.user.email) {
			return ctx.json(null, {
				status: 400,
				body: {
					message: "You are not the repentant of the invitation",
				},
			});
		}
		const organization = await adapter.findOrganizationById(
			invitation.organizationId,
		);
		if (!organization) {
			return ctx.json(null, {
				status: 400,
				body: {
					message: "Organization not found!",
				},
			});
		}
		const member = await adapter.findMemberByOrgId({
			userId: invitation.inviterId,
			organizationId: invitation.organizationId,
		});
		if (!member) {
			return ctx.json(null, {
				status: 400,
				body: {
					message: "Inviter is no longer a member of this organization",
				},
			});
		}
		return ctx.json({
			...invitation,
			organizationName: organization.name,
			organizationSlug: organization.slug,
			inviterEmail: member.email,
			inviterName: member.name,
		});
	},
);
