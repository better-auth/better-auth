import * as z from "zod/v4";
import { APIError, createAuthEndpoint } from "../../../../api";
import type { TeamsAddon } from "../../addons";
import type { RealTeamId } from "../../addons/teams/helpers/get-team-adapter";
import { getTeamAdapter } from "../../addons/teams/helpers/get-team-adapter";
import { ORGANIZATION_ERROR_CODES } from "../../helpers/error-codes";
import { getOrgAdapter } from "../../helpers/get-org-adapter";
import { resolveOrgOptions } from "../../helpers/resolve-org-options";
import { orgMiddleware, orgSessionMiddleware } from "../../middleware";
import type { OrganizationOptions } from "../../types";

const leaveOrganizationBodySchema = z.object({
	organizationId: z.string().meta({
		description:
			'The organization ID for the member to leave. Eg: "organization-id"',
	}),
});

export type LeaveOrganization<O extends OrganizationOptions> = ReturnType<
	typeof leaveOrganization<O>
>;

export const leaveOrganization = <O extends OrganizationOptions>(
	_options: O,
) => {
	const options = resolveOrgOptions(_options);

	return createAuthEndpoint(
		"/organization/leave",
		{
			method: "POST",
			body: leaveOrganizationBodySchema,
			requireHeaders: true,
			use: [orgMiddleware, orgSessionMiddleware],
			metadata: {
				openapi: {
					operationId: "leaveOrganization",
					description: "Leave an organization as the current user",
					responses: {
						"200": {
							description: "Success",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											id: { type: "string" },
											userId: { type: "string" },
											organizationId: { type: "string" },
											role: { type: "string" },
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
			const adapter = getOrgAdapter<O>(ctx.context, _options);
			const realOrgId = await adapter.getRealOrganizationId(
				ctx.body.organizationId,
			);

			const member = await adapter.findMemberByOrgId({
				userId: session.user.id,
				organizationId: realOrgId,
			});

			if (!member) {
				const code = "MEMBER_NOT_FOUND";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("BAD_REQUEST", msg);
			}

			const creatorRole = options.creatorRole;
			const isOwnerLeaving = member.role.split(",").includes(creatorRole);

			if (isOwnerLeaving) {
				const { members } = await adapter.listMembers({
					organizationId: realOrgId,
				});
				const owners = members.filter((m) =>
					m.role.split(",").includes(creatorRole),
				);
				if (owners.length <= 1) {
					const code = "YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER";
					const msg = ORGANIZATION_ERROR_CODES[code];
					throw APIError.from("BAD_REQUEST", msg);
				}
			}

			// Delete user from all teams in the organization before leaving
			type T = TeamsAddon | undefined;
			const team = options.use.find((x) => x.id === "teams") as T;
			if (team) {
				const teamOpts = team.options;
				const teamAdapter = getTeamAdapter(ctx.context, teamOpts);
				const teams = await teamAdapter.getTeams(realOrgId);
				await Promise.all(
					teams.map((team) =>
						teamAdapter.removeTeamMember({
							teamId: team.id as RealTeamId,
							userId: session.user.id,
						}),
					),
				);
			}

			await adapter.deleteMember({
				memberId: member.id,
				organizationId: realOrgId,
				userId: session.user.id,
			});

			if (session.session.activeOrganizationId === realOrgId) {
				await adapter.setActiveOrganization(session.session.token, null);
			}

			return ctx.json(member);
		},
	);
};
