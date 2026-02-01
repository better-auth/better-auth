import * as z from "zod/v4";
import { APIError, createAuthEndpoint } from "../../../../api";
import { hasPermission } from "../../access";
import { ORGANIZATION_ERROR_CODES } from "../../helpers/error-codes";
import { getHook } from "../../helpers/get-hook";
import { getOrgAdapter } from "../../helpers/get-org-adapter";
import { getOrganizationId } from "../../helpers/get-organization-id";
import { resolveOrgOptions } from "../../helpers/resolve-org-options";
import { orgMiddleware, orgSessionMiddleware } from "../../middleware";
import type { InferMember, OrganizationOptions } from "../../types";

const baseRemoveMemberSchema = z.object({
	memberIdOrEmail: z.string().meta({
		description: "The ID or email of the member to remove",
	}),
	/**
	 * If not provided, the active organization will be used
	 */
	organizationId: z
		.string()
		.meta({
			description:
				'The ID of the organization to remove the member from. If not provided, the active organization will be used. Eg: "org-id"',
		})
		.optional(),
});

export type RemoveMember<O extends OrganizationOptions> = ReturnType<
	typeof removeMember<O>
>;

export const removeMember = <O extends OrganizationOptions>(_options: O) => {
	const options = resolveOrgOptions(_options);

	return createAuthEndpoint(
		"/organization/remove-member",
		{
			method: "POST",
			body: baseRemoveMemberSchema,
			requireHeaders: true,
			use: [orgMiddleware, orgSessionMiddleware],
			metadata: {
				openapi: {
					operationId: "removeOrganizationMember",
					description: "Remove a member from an organization",
					responses: {
						"200": {
							description: "Success",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											member: {
												type: "object",
												properties: {
													id: {
														type: "string",
													},
													userId: {
														type: "string",
													},
													organizationId: {
														type: "string",
													},
													role: {
														type: "string",
													},
												},
												required: ["id", "userId", "organizationId", "role"],
											},
										},
										required: ["member"],
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
			const orgId = await getOrganizationId({ ctx });
			const adapter = getOrgAdapter<O>(ctx.context, _options);
			const realOrgId = await adapter.getRealOrganizationId(orgId);

			const member = await adapter.findMemberByOrgId({
				userId: session.user.id,
				organizationId: realOrgId,
			});

			if (!member) {
				const code = "MEMBER_NOT_FOUND";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("BAD_REQUEST", msg);
			}

			let toBeRemovedMember: InferMember<O, false> | null = null;
			if (ctx.body.memberIdOrEmail.includes("@")) {
				const result = await adapter.findMemberByEmail({
					email: ctx.body.memberIdOrEmail,
					organizationId: realOrgId,
				});
				if (result) {
					const { user: _user, ...memberData } = result;
					toBeRemovedMember = memberData as unknown as InferMember<O, false>;
				}
			} else {
				const result = await adapter.findMemberById(ctx.body.memberIdOrEmail);
				if (result) {
					const { user: _user, ...memberData } = result;
					toBeRemovedMember = memberData as unknown as InferMember<O, false>;
				}
			}

			if (!toBeRemovedMember) {
				const code = "MEMBER_NOT_FOUND";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("BAD_REQUEST", msg);
			}

			const roles = toBeRemovedMember.role.split(",");
			const creatorRole = options.creatorRole;
			const isOwner = roles.includes(creatorRole);

			if (isOwner) {
				if (member.role !== creatorRole) {
					const code = "YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER";
					const msg = ORGANIZATION_ERROR_CODES[code];
					throw APIError.from("BAD_REQUEST", msg);
				}
				const { members } = await adapter.listMembers({
					organizationId: realOrgId,
				});
				const owners = members.filter((m) => {
					const memberRoles = m.role.split(",");
					return memberRoles.includes(creatorRole);
				});
				if (owners.length <= 1) {
					const code = "YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER";
					const msg = ORGANIZATION_ERROR_CODES[code];
					throw APIError.from("BAD_REQUEST", msg);
				}
			}

			const canDeleteMember = await hasPermission(
				{
					role: member.role,
					options: ctx.context.orgOptions,
					permissions: {
						member: ["delete"],
					},
					organizationId: realOrgId,
				},
				ctx,
			);

			if (!canDeleteMember) {
				const code = "YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("UNAUTHORIZED", msg);
			}

			if (toBeRemovedMember.organizationId !== realOrgId) {
				const code = "MEMBER_NOT_FOUND";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("BAD_REQUEST", msg);
			}

			const organization = await adapter.findOrganizationById(orgId);
			if (!organization) {
				const code = "ORGANIZATION_NOT_FOUND";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("BAD_REQUEST", msg);
			}

			const userBeingRemoved = await ctx.context.internalAdapter.findUserById(
				toBeRemovedMember.userId,
			);
			if (!userBeingRemoved) {
				throw APIError.fromStatus("BAD_REQUEST", {
					message: "User not found",
				});
			}

			const removeMemberHook = getHook("RemoveMember", options);

			await removeMemberHook.before(
				{
					member: toBeRemovedMember,
					user: userBeingRemoved,
					organization,
				},
				ctx,
			);

			await adapter.deleteMember({
				memberId: toBeRemovedMember.id,
				organizationId: realOrgId,
				userId: toBeRemovedMember.userId,
			});

			if (
				session.user.id === toBeRemovedMember.userId &&
				session.session.activeOrganizationId ===
					toBeRemovedMember.organizationId
			) {
				await adapter.setActiveOrganization(session.session.token, null);
			}

			await removeMemberHook.after(
				{
					member: toBeRemovedMember,
					user: userBeingRemoved,
					organization,
				},
				ctx,
			);

			return ctx.json({
				member: toBeRemovedMember,
			});
		},
	);
};
