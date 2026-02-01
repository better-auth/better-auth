import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import * as z from "zod/v4";
import { getSessionFromCtx } from "../../../../../api";
import { hasPermission } from "../../../access";
import { ORGANIZATION_ERROR_CODES } from "../../../helpers/error-codes";
import { getOrgAdapter } from "../../../helpers/get-org-adapter";
import { getOrganizationId } from "../../../helpers/get-organization-id";
import { orgMiddleware } from "../../../middleware/org-middleware";
import { TEAMS_ERROR_CODES } from "../helpers/errors";
import { getTeamAdapter } from "../helpers/get-team-adapter";
import { getHook } from "../helpers/get-team-hook";
import { resolveTeamOptions } from "../helpers/resolve-team-options";
import type { TeamsOptions } from "../types";

const removeTeamMemberBodySchema = z.object({
	teamId: z.string().meta({
		description: "The team the user should be removed from.",
	}),
	userId: z.coerce.string().meta({
		description: "The user which should be removed from the team.",
	}),
	organizationId: z
		.string()
		.meta({
			description:
				'An optional organization ID. If not provided, will default to the user\'s active organization. Eg: "org-id"',
		})
		.optional(),
});

export const removeTeamMember = <O extends TeamsOptions>(_options?: O) => {
	const options = resolveTeamOptions(_options);

	return createAuthEndpoint(
		"/organization/remove-team-member",
		{
			method: "POST",
			body: removeTeamMemberBodySchema,
			requireHeaders: true,
			use: [orgMiddleware],
			metadata: {
				openapi: {
					operationId: "removeTeamMember",
					description: "Remove a member from a team",
					responses: {
						"200": {
							description: "Team member removed successfully",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											message: {
												type: "string",
												description:
													"Confirmation message indicating successful removal",
												enum: ["Team member removed successfully."],
											},
										},
										required: ["message"],
									},
								},
							},
						},
					},
				},
			},
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session) throw APIError.fromStatus("UNAUTHORIZED");

			const orgAdapter = getOrgAdapter(ctx.context, ctx.context.orgOptions);
			const teamAdapter = getTeamAdapter(ctx.context, options);
			const orgId = await getOrganizationId({ ctx });
			const realOrgId = await orgAdapter.getRealOrganizationId(orgId);

			const currentMember = await orgAdapter.findMemberByOrgId({
				userId: session.user.id,
				organizationId: realOrgId,
			});

			if (!currentMember) {
				const code = "USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("BAD_REQUEST", msg);
			}

			const canDeleteMember = await hasPermission(
				{
					role: currentMember.role,
					options: ctx.context.orgOptions,
					permissions: {
						member: ["delete"],
					},
					organizationId: realOrgId,
				},
				ctx,
			);

			if (!canDeleteMember) {
				const code = "YOU_ARE_NOT_ALLOWED_TO_REMOVE_A_TEAM_MEMBER";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("FORBIDDEN", msg);
			}

			const toBeRemovedMember = await orgAdapter.findMemberByOrgId({
				userId: ctx.body.userId,
				organizationId: realOrgId,
			});

			if (!toBeRemovedMember) {
				const code = "USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("BAD_REQUEST", msg);
			}

			const realTeamId = await teamAdapter.getRealTeamId(ctx.body.teamId);

			const team = await teamAdapter.findTeamById({
				teamId: ctx.body.teamId,
				organizationId: realOrgId,
			});

			if (!team) {
				const msg = TEAMS_ERROR_CODES.TEAM_NOT_FOUND;
				throw APIError.from("BAD_REQUEST", msg);
			}

			const organization = await orgAdapter.findOrganizationById(realOrgId);
			if (!organization) {
				const msg = ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND;
				throw APIError.from("BAD_REQUEST", msg);
			}

			const userBeingRemoved = await ctx.context.internalAdapter.findUserById(
				ctx.body.userId,
			);
			if (!userBeingRemoved) {
				const code = "MEMBER_NOT_FOUND";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("BAD_REQUEST", msg);
			}

			const teamMember = await teamAdapter.findTeamMember({
				teamId: realTeamId,
				userId: ctx.body.userId,
			});

			if (!teamMember) {
				const code = "USER_IS_NOT_A_MEMBER_OF_THE_TEAM";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("BAD_REQUEST", msg);
			}

			const removeTeamMemberHook = getHook("RemoveTeamMember", options);

			await removeTeamMemberHook.before(
				{
					teamMember,
					team,
					user: userBeingRemoved,
					organization,
				},
				ctx,
			);

			await teamAdapter.removeTeamMember({
				teamId: realTeamId,
				userId: ctx.body.userId,
			});

			await removeTeamMemberHook.after(
				{
					teamMember,
					team,
					user: userBeingRemoved,
					organization,
				},
				ctx,
			);

			return ctx.json({ message: "Team member removed successfully." });
		},
	);
};
