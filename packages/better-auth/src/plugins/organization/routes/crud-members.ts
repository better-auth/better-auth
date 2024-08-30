import { z } from "zod";
import { createAuthEndpoint } from "../../../api/call";
import { getOrgAdapter } from "../adapter";
import { orgMiddleware, orgSessionMiddleware } from "../call";

export const deleteMember = createAuthEndpoint(
	"/org/delete-member",
	{
		method: "POST",
		body: z.object({
			memberId: z.string(),
		}),
		use: [orgMiddleware, orgSessionMiddleware],
	},
	async (ctx) => {
		const session = ctx.context.session;
		const orgId = session.session.activeOrganizationId;
		if (!orgId) {
			return ctx.json(null, {
				status: 400,
				body: {
					message: "No active organization found!",
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
					message: "Member not found!",
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
		if (
			session.user.id === member.userId &&
			member.role === (ctx.context.orgOptions?.creatorRole || "owner")
		) {
			return ctx.json(null, {
				status: 400,
				body: {
					message: "You cannot delete yourself",
				},
			});
		}
		const canDeleteMember = role.authorize({
			member: ["delete"],
		});
		if (canDeleteMember.error) {
			return ctx.json(null, {
				body: {
					message: "You are not allowed to delete this member",
				},
				status: 403,
			});
		}
		const existing = await adapter.findMemberById(ctx.body.memberId);
		if (existing?.organizationId !== orgId) {
			return ctx.json(null, {
				status: 400,
				body: {
					message: "Member not found!",
				},
			});
		}
		const deletedMember = await adapter.deleteMember(ctx.body.memberId);
		if (
			session.user.id === existing.userId &&
			session.session.activeOrganizationId === existing.organizationId
		) {
			await adapter.setActiveOrganization(session.session.id, null);
		}
		return ctx.json(deletedMember);
	},
);

export const updateMember = createAuthEndpoint(
	"/org/update-member",
	{
		method: "POST",
		body: z.object({
			memberId: z.string(),
			role: z.string(),
		}),
		use: [orgMiddleware, orgSessionMiddleware],
	},
	async (ctx) => {
		const session = ctx.context.session;
		const orgId = session.session.activeOrganizationId;
		if (!orgId) {
			return ctx.json(null, {
				status: 400,
				body: {
					message: "No active organization found!",
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
					message: "Member not found!",
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
		const canUpdateMember = role.authorize({
			member: ["update"],
		});
		if (canUpdateMember.error) {
			return ctx.json(null, {
				body: {
					message: "You are not allowed to update this member",
				},
				status: 403,
			});
		}
		const updatedMember = await adapter.updateMember(
			ctx.body.memberId,
			ctx.body.role,
		);
		return ctx.json(updatedMember);
	},
);
