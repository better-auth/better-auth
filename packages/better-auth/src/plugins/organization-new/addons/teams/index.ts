import { APIError } from "@better-auth/core/error";
import type { Addon } from "../../types";
import { TEAMS_ERROR_CODES } from "./errors";
import { getTeamAdapter } from "./get-team-adapter";
import { resolveTeamOptions } from "./resolve-team-options";
import type { Team } from "./schema";
import type { TeamsOptions } from "./types";
import { getHook } from "./get-team-hook";

export const teams = <O extends TeamsOptions>(_options?: O | undefined) => {
	const options = resolveTeamOptions(_options);
	return {
		id: "teams",
		priority: 10, // Run early to create default teams before other addons
		hooks: {
			async afterCreateOrganization({ organization, user }, ctx) {
				const adapter = getTeamAdapter(ctx.context, options);
				const { customCreateDefaultTeam, enabled } = options.defaultTeam;
				if (!enabled) return;

				const teamData: Omit<Team, "id"> = {
					organizationId: organization.id,
					name: `${organization.name}`,
					createdAt: new Date(),
					updatedAt: new Date(),
				};

				const teamHook = getHook("CreateTeam", options);

				const team = await (async () => {
					try {
						if (customCreateDefaultTeam) {
							return await customCreateDefaultTeam(organization, ctx);
						}
						const mutate = await teamHook.before({
							team: teamData,
							user,
							organization,
						});
						return await adapter.createTeam({ ...teamData, ...(mutate ?? {}) });
					} catch (error) {
						ctx.context.logger.error("Failed to create default team:", error);
						const msg = TEAMS_ERROR_CODES.FAILED_TO_CREATE_TEAM;
						throw APIError.from("INTERNAL_SERVER_ERROR", msg);
					}
				})();

				try {
					await adapter.createTeamMember({
						teamId: team.id,
						userId: user.id,
					});
				} catch (error) {
					ctx.context.logger.error("Failed to create team member:", error);
					const msg = TEAMS_ERROR_CODES.FAILED_TO_CREATE_TEAM_MEMBER;
					throw APIError.from("INTERNAL_SERVER_ERROR", msg);
				}
			},
		},
		errorCodes: TEAMS_ERROR_CODES,
	} satisfies Addon<O>;
};
