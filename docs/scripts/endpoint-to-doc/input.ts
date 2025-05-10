//@ts-nocheck
import {
	createAuthEndpoint,
	orgMiddleware,
	orgSessionMiddleware,
	requestOnlySessionMiddleware,
	sessionMiddleware,
} from "./index";
import { z } from "zod";

export const leaveOrganization = createAuthEndpoint(
	"/organization/leave",
	{
		method: "POST",
		body: z.object({
			organizationId: z.string({
				description:
					'The organization Id for the member to leave. Eg: "organization-id"',
			}),
		}),
		requireHeaders: true,
		use: [sessionMiddleware, orgMiddleware],
	},
	async (ctx) => {
		const session = ctx.context.session;
		const adapter = getOrgAdapter(ctx.context);
		const member = await adapter.findMemberByOrgId({
			userId: session.user.id,
			organizationId: ctx.body.organizationId,
		});
		if (!member) {
			throw new APIError("BAD_REQUEST", {
				message: ORGANIZATION_ERROR_CODES.MEMBER_NOT_FOUND,
			});
		}
		const isOwnerLeaving =
			member.role === (ctx.context.orgOptions?.creatorRole || "owner");
		if (isOwnerLeaving) {
			const members = await ctx.context.adapter.findMany<Member>({
				model: "member",
				where: [
					{
						field: "organizationId",
						value: ctx.body.organizationId,
					},
				],
			});
			const owners = members.filter(
				(member) =>
					member.role === (ctx.context.orgOptions?.creatorRole || "owner"),
			);
			if (owners.length <= 1) {
				throw new APIError("BAD_REQUEST", {
					message:
						ORGANIZATION_ERROR_CODES.YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER,
				});
			}
		}
		await adapter.deleteMember(member.id);
		if (session.session.activeOrganizationId === ctx.body.organizationId) {
			await adapter.setActiveOrganization(session.session.token, null);
		}
		return ctx.json(member);
	},
);
