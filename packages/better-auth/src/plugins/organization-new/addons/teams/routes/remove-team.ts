import { createAuthEndpoint } from "@better-auth/core/api";
import * as z from "zod/v4";
import { APIError, getSessionFromCtx } from "../../../../../api";
import { hasPermission } from "../../../access";
import { ORGANIZATION_ERROR_CODES } from "../../../helpers/error-codes";
import { getOrgAdapter } from "../../../helpers/get-org-adapter";
import { getOrganizationId } from "../../../helpers/get-organization-id";
import { orgMiddleware } from "../../../middleware";
import type { RealTeamId } from "../helpers/get-team-adapter";
import { getTeamAdapter } from "../helpers/get-team-adapter";
import { getHook } from "../helpers/get-team-hook";
import { resolveTeamOptions } from "../helpers/resolve-team-options";
import type { TeamsOptions } from "../types";

const removeTeamBodySchema = z.object({
	teamId: z.string().meta({
		description: `The team ID of the team to remove. Eg: "team-id"`,
	}),
	organizationId: z
		.string()
		.meta({
			description: `The organization ID which the team falls under. If not provided, it will default to the user's active organization. Eg: "organization-id"`,
		})
		.optional(),
});

export const removeTeam = <O extends TeamsOptions>(
	_options?: O | undefined,
) => {
	const options = resolveTeamOptions(_options);
	return createAuthEndpoint(
		"/organization/remove-team",
		{
			method: "POST",
			body: removeTeamBodySchema,
			use: [orgMiddleware],
			metadata: {
				openapi: {
					description: "Remove a team from an organization",
					responses: {
						"200": {
							description: "Team removed successfully",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											message: {
												type: "string",
												description:
													"Confirmation message indicating successful removal",
												enum: ["Team removed successfully."],
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
			const orgOptions = ctx.context.orgOptions;
			const session = await getSessionFromCtx(ctx);

			const teamAdapter = getTeamAdapter<O>(ctx.context, options);
			const orgAdapter = getOrgAdapter(ctx.context, orgOptions);
			const organizationId = await getOrganizationId({ ctx });
			const realOrgId = await orgAdapter.getRealOrganizationId(organizationId);

			if (!session && (ctx.request || ctx.headers)) {
				throw APIError.fromStatus("UNAUTHORIZED");
			}

			if (session) {
				const member = await orgAdapter.findMemberByOrgId({
					userId: session.user.id,
					organizationId: realOrgId,
				});

				if (!member || session.session?.activeTeamId === ctx.body.teamId) {
					const code = "YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_TEAM";
					const msg = ORGANIZATION_ERROR_CODES[code];
					throw APIError.from("FORBIDDEN", msg);
				}

				const canRemove = await hasPermission(
					{
						role: member.role,
						options: ctx.context.orgOptions,
						permissions: {
							team: ["delete"],
						},
						organizationId: realOrgId,
					},
					ctx,
				);

				if (!canRemove) {
					const code = "YOU_ARE_NOT_ALLOWED_TO_DELETE_TEAMS_IN_THIS_ORG";
					const msg = ORGANIZATION_ERROR_CODES[code];
					throw APIError.from("FORBIDDEN", msg);
				}
			}
			const team = await teamAdapter.findTeamById({
				teamId: ctx.body.teamId,
				organizationId: realOrgId,
			});
			if (!team || team.organizationId !== organizationId) {
				const msg = ORGANIZATION_ERROR_CODES.TEAM_NOT_FOUND;
				throw APIError.from("BAD_REQUEST", msg);
			}

			if (!options.allowRemovingAllTeams) {
				const teamsCount = await teamAdapter.countTeams(realOrgId);
				if (teamsCount <= 1) {
					const msg = ORGANIZATION_ERROR_CODES.UNABLE_TO_REMOVE_LAST_TEAM;
					throw APIError.from("BAD_REQUEST", msg);
				}
			}

			const org = await orgAdapter.findOrganizationById(organizationId);
			if (!org) {
				const msg = ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND;
				throw APIError.from("BAD_REQUEST", msg);
			}

			const deleteTeamHook = getHook("DeleteTeam", options);

			const user = session?.user;
			const hookProps = { team, user, organization: org };

			await deleteTeamHook.before(hookProps, ctx);
			await teamAdapter.deleteTeam(team.id as unknown as RealTeamId);
			await deleteTeamHook.after(hookProps, ctx);

			return ctx.json({ message: "Team removed successfully." });
		},
	);
};
