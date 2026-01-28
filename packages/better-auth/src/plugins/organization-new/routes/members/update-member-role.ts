import { BASE_ERROR_CODES } from "@better-auth/core/error";
import * as z from "zod/v4";
import { APIError, createAuthEndpoint } from "../../../../api";
import { hasPermission, parseRoles } from "../../access";
import { ORGANIZATION_ERROR_CODES } from "../../helpers/error-codes";
import { getHook } from "../../helpers/get-hook";
import { getOrgAdapter } from "../../helpers/get-org-adapter";
import { getOrganizationId } from "../../helpers/get-organization-id";
import { resolveOrgOptions } from "../../helpers/resolve-org-options";
import { orgMiddleware, orgSessionMiddleware } from "../../middleware";
import type { InferMember, OrganizationOptions } from "../../types";

const baseUpdateMemberRoleSchema = z.object({
	role: z.union([z.string(), z.array(z.string())]).meta({
		description:
			'The new role to be applied. This can be a string or array of strings representing the roles. Eg: ["admin", "sale"]',
	}),
	memberId: z.string().meta({
		description: 'The member id to apply the role update to. Eg: "member-id"',
	}),
	organizationId: z
		.string()
		.meta({
			description:
				'An optional organization ID which the member is a part of to apply the role update. If not provided, you must provide session headers to get the active organization. Eg: "organization-id"',
		})
		.optional(),
});

export type UpdateMemberRole<O extends OrganizationOptions> = ReturnType<
	typeof updateMemberRole<O>
>;

export const updateMemberRole = <O extends OrganizationOptions>(
	_options: O,
) => {
	const options = resolveOrgOptions(_options);

	return createAuthEndpoint(
		"/organization/update-member-role",
		{
			method: "POST",
			body: baseUpdateMemberRoleSchema,
			use: [orgMiddleware, orgSessionMiddleware],
			requireHeaders: true,
			metadata: {
				openapi: {
					operationId: "updateOrganizationMemberRole",
					description: "Update the role of a member in an organization",
					responses: {
						"200": {
							description: "Success",
							content: {
								"application/json": {
									schema: {
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
							},
						},
					},
				},
			},
		},
		async (ctx) => {
			const session = ctx.context.session;

			if (!ctx.body.role) {
				throw APIError.fromStatus("BAD_REQUEST");
			}

			const orgId = await getOrganizationId({ ctx });
			const adapter = getOrgAdapter<O>(ctx.context, _options);
			const realOrgId = await adapter.getRealOrganizationId(orgId);

			const roleToSet: string[] = Array.isArray(ctx.body.role)
				? ctx.body.role
				: ctx.body.role
					? [ctx.body.role]
					: [];

			const member = await adapter.findMemberByOrgId({
				userId: session.user.id,
				organizationId: realOrgId,
			});

			if (!member) {
				const code = "MEMBER_NOT_FOUND";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("BAD_REQUEST", msg);
			}

			let toBeUpdatedMember: InferMember<O, false> | null = null;
			if (member.id !== ctx.body.memberId) {
				const result = await adapter.findMemberById(ctx.body.memberId);
				if (result) {
					const { user: _user, ...memberData } = result;
					toBeUpdatedMember = memberData as unknown as InferMember<O, false>;
				}
			} else {
				toBeUpdatedMember = member as unknown as InferMember<O, false>;
			}

			if (!toBeUpdatedMember) {
				const code = "MEMBER_NOT_FOUND";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("BAD_REQUEST", msg);
			}

			const memberBelongsToOrganization =
				toBeUpdatedMember.organizationId === realOrgId;

			if (!memberBelongsToOrganization) {
				const code = "YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("FORBIDDEN", msg);
			}

			const creatorRole = options.creatorRole;

			const updatingMemberRoles = member.role.split(",");
			const toBeUpdatedMemberRoles = toBeUpdatedMember.role.split(",");

			const isUpdatingCreator = toBeUpdatedMemberRoles.includes(creatorRole);
			const updaterIsCreator = updatingMemberRoles.includes(creatorRole);

			const isSettingCreatorRole = roleToSet.includes(creatorRole);

			const memberIsUpdatingThemselves = member.id === toBeUpdatedMember.id;

			if (
				(isUpdatingCreator && !updaterIsCreator) ||
				(isSettingCreatorRole && !updaterIsCreator)
			) {
				const code = "YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("FORBIDDEN", msg);
			}

			if (updaterIsCreator && memberIsUpdatingThemselves) {
				const { members } = await adapter.listMembers({
					organizationId: realOrgId,
				});
				const owners = members.filter((m) => {
					const roles = m.role.split(",");
					return roles.includes(creatorRole);
				});
				if (owners.length <= 1 && !isSettingCreatorRole) {
					const code = "YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER";
					const msg = ORGANIZATION_ERROR_CODES[code];
					throw APIError.from("BAD_REQUEST", msg);
				}
			}

			const canUpdateMember = await hasPermission(
				{
					role: member.role,
					options: ctx.context.orgOptions,
					permissions: {
						member: ["update"],
					},
					organizationId: realOrgId,
				},
				ctx,
			);

			if (!canUpdateMember) {
				const code = "YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("FORBIDDEN", msg);
			}

			const organization = await adapter.findOrganizationById(orgId);
			if (!organization) {
				const code = "ORGANIZATION_NOT_FOUND";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("BAD_REQUEST", msg);
			}

			const userBeingUpdated = await ctx.context.internalAdapter.findUserById(
				toBeUpdatedMember.userId,
			);
			if (!userBeingUpdated) {
				const msg = BASE_ERROR_CODES.USER_NOT_FOUND;
				throw APIError.from("BAD_REQUEST", msg);
			}

			const previousRole = toBeUpdatedMember.role;
			const newRole = parseRoles(ctx.body.role as string | string[]);

			const updateMemberRoleHook = getHook("UpdateMemberRole", options);

			const modify = await updateMemberRoleHook.before(
				{
					member: toBeUpdatedMember,
					newRole,
					user: userBeingUpdated,
					organization,
				},
				ctx,
			);

			let roleToApply = newRole;
			if (modify && "role" in modify) {
				roleToApply = modify.role as string;
			}

			const updatedMember = await adapter.updateMember(
				ctx.body.memberId,
				roleToApply,
			);

			if (!updatedMember) {
				const code = "MEMBER_NOT_FOUND";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("BAD_REQUEST", msg);
			}

			await updateMemberRoleHook.after(
				{
					member: updatedMember,
					previousRole,
					user: userBeingUpdated,
					organization,
				},
				ctx,
			);

			return ctx.json(updatedMember);
		},
	);
};
