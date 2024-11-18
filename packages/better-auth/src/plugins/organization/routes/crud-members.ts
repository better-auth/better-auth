import { z } from "zod";
import { createAuthEndpoint } from "../../../api/call";
import { getOrgAdapter } from "../adapter";
import { orgMiddleware, orgSessionMiddleware } from "../call";
import { type Member, role } from "../schema";
import { APIError } from "better-call";
import type { User } from "../../../db/schema";
import { generateId } from "../../../utils";

export const addMember = createAuthEndpoint(
	"/organization/add-member",
	{
		method: "POST",
		body: z.object({
			userIdOrEmail: z.string(),
			role: role,
			organizationId: z.string().optional(),
		}),
		use: [orgMiddleware, orgSessionMiddleware],
		metadata: {
			SERVER_ONLY: true
		}
	},
	async (ctx) => {
		const session = ctx.context.session;
		const orgId =
			ctx.body.organizationId || session.session.activeOrganizationId;
		if (!orgId) {
			return ctx.json(null, {
				status: 400,
				body: {
					message: "No active organization found!",
				},
			});
		}

		const adapter = getOrgAdapter(ctx.context, ctx.context.orgOptions);

		let user: User | null;
		if (ctx.body.userIdOrEmail.includes("@")) {
			user = await ctx.context.adapter.findOne<User>({
				model: ctx.context.tables.user.tableName,
				where: [
					{
						field: "email",
						value: ctx.body.userIdOrEmail,
					},
				],
			});
		} else {
			user = await ctx.context.adapter.findOne<User>({
				model: ctx.context.tables.user.tableName,
				where: [
					{
						field: "id",
						value: ctx.body.userIdOrEmail,
					},
				],
			});
		}

		if (!user) {
			throw new APIError("BAD_REQUEST", {
				message: "User not found!",
			});
		}

		const alreadyMember = await adapter.findMemberByEmail({
			email: user.email,
			organizationId: orgId,
		});
		if (alreadyMember) {
			throw new APIError("BAD_REQUEST", {
				message: "User is already a member of this organization",
			});
		}

		const createdMember = await adapter.createMember({
			id: generateId(),
			organizationId: orgId,
			userId: user.id,
			email: user.email,
			role: ctx.body.role,
			createdAt: new Date(),
		});

		return ctx.json({
			member: createdMember,
		});
	},
);

export const removeMember = createAuthEndpoint(
	"/organization/remove-member",
	{
		method: "POST",
		body: z.object({
			memberIdOrEmail: z.string(),
			/**
			 * If not provided, the active organization will be used
			 */
			organizationId: z.string().optional(),
		}),
		use: [orgMiddleware, orgSessionMiddleware],
	},
	async (ctx) => {
		const session = ctx.context.session;
		const organizationId =
			ctx.body.organizationId || session.session.activeOrganizationId;
		if (!organizationId) {
			return ctx.json(null, {
				status: 400,
				body: {
					message: "No active organization found!",
				},
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
		const isLeaving =
			session.user.email === ctx.body.memberIdOrEmail ||
			member.id === ctx.body.memberIdOrEmail;
		const isOwnerLeaving =
			isLeaving &&
			member.role === (ctx.context.orgOptions?.creatorRole || "owner");
		if (isOwnerLeaving) {
			throw new APIError("BAD_REQUEST", {
				message: "You cannot leave the organization as the owner",
			});
		}

		const canDeleteMember =
			isLeaving ||
			role.authorize({
				member: ["delete"],
			}).success;
		if (!canDeleteMember) {
			throw new APIError("UNAUTHORIZED", {
				message: "You are not allowed to delete this member",
			});
		}
		let existing: Member | null = null;
		if (ctx.body.memberIdOrEmail.includes("@")) {
			existing = await adapter.findMemberByEmail({
				email: ctx.body.memberIdOrEmail,
				organizationId: organizationId,
			});
		} else {
			existing = await adapter.findMemberById(ctx.body.memberIdOrEmail);
		}
		if (existing?.organizationId !== organizationId) {
			throw new APIError("BAD_REQUEST", {
				message: "Member not found!",
			});
		}
		await adapter.deleteMember(existing.id);
		if (
			session.user.id === existing.userId &&
			session.session.activeOrganizationId === existing.organizationId
		) {
			await adapter.setActiveOrganization(session.session.id, null);
		}
		return ctx.json({
			member: existing,
		});
	},
);

export const updateMemberRole = createAuthEndpoint(
	"/organization/update-member-role",
	{
		method: "POST",
		body: z.object({
			role: z.enum(["admin", "member", "owner"]),
			memberId: z.string(),
			/**
			 * If not provided, the active organization will be used
			 */
			organizationId: z.string().optional(),
		}),
		use: [orgMiddleware, orgSessionMiddleware],
	},
	async (ctx) => {
		const session = ctx.context.session;
		const organizationId =
			ctx.body.organizationId || session.session.activeOrganizationId;
		if (!organizationId) {
			return ctx.json(null, {
				status: 400,
				body: {
					message: "No active organization found!",
				},
			});
		}
		const adapter = getOrgAdapter(ctx.context, ctx.context.orgOptions);
		const member = await adapter.findMemberByOrgId({
			userId: session.user.id,
			organizationId: organizationId,
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
		/**
		 * If the member is not an owner, they cannot update the role of another member
		 * as an owner.
		 */
		const canUpdateMember =
			role.authorize({
				member: ["update"],
			}).error ||
			(ctx.body.role === "owner" && member.role !== "owner");
		if (canUpdateMember) {
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
		if (!updatedMember) {
			return ctx.json(null, {
				status: 400,
				body: {
					message: "Member not found!",
				},
			});
		}
		return ctx.json(updatedMember);
	},
);

export const getActiveMember = createAuthEndpoint(
	"/organization/get-active-member",
	{
		method: "GET",
		use: [orgMiddleware, orgSessionMiddleware],
	},
	async (ctx) => {
		const session = ctx.context.session;
		const organizationId = session.session.activeOrganizationId;
		if (!organizationId) {
			return ctx.json(null, {
				status: 400,
				body: {
					message: "No active organization found!",
				},
			});
		}
		const adapter = getOrgAdapter(ctx.context, ctx.context.orgOptions);
		const member = await adapter.findMemberByOrgId({
			userId: session.user.id,
			organizationId: organizationId,
		});
		if (!member) {
			return ctx.json(null, {
				status: 400,
				body: {
					message: "Member not found!",
				},
			});
		}
		return ctx.json(member);
	},
);
