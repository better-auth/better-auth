import type { AuthContext } from "@better-auth/core";
import type { User } from "@better-auth/core/db";
import { APIError } from "@better-auth/core/error";
import type { Organization } from "../../../schema";
import { TEAMS_ERROR_CODES } from "../helpers/errors";
import type { RealTeamId } from "../helpers/get-team-adapter";
import { getTeamAdapter } from "../helpers/get-team-adapter";
import { getHook } from "../helpers/get-team-hook";
import type { Team } from "../schema";
import type { InferTeam, ResolvedTeamsOptions } from "../types";

/**
 * This event will create a default team after an org is created.
 */
export const afterCreateOrganization = async <O extends ResolvedTeamsOptions>(
	{ user, organization }: { user: User; organization: Organization },
	authContext: AuthContext,
	options: O,
) => {
	const adapter = getTeamAdapter(authContext, options);
	const { customCreateDefaultTeam, enabled } = options.defaultTeam;
	if (!enabled) return;

	const teamData: Omit<Team, "id"> & Record<string, any> = {
		organizationId: organization.id,
		name: `${organization.name}`,
		createdAt: new Date(),
		updatedAt: new Date(),
	};

	const teamHook = getHook("CreateTeam", options);

	let team: InferTeam<O> & Record<string, any>;
	try {
		team = await (async () => {
			type Result = InferTeam<O> & Record<string, any>;
			if (customCreateDefaultTeam) {
				const result = await customCreateDefaultTeam(organization);
				return result as unknown as Result;
			}
			const mutate = await teamHook.before(
				{
					team: teamData,
					user,
					organization,
				},
				null,
			);
			const result = await adapter.createTeam({
				...teamData,
				...(mutate ?? {}),
			});
			return result as unknown as Result;
		})();
	} catch (error) {
		authContext.logger.error("Failed to create default team:", error);
		const msg = TEAMS_ERROR_CODES.FAILED_TO_CREATE_TEAM;
		throw APIError.from("INTERNAL_SERVER_ERROR", msg);
	}

	await teamHook.after({ organization, team, user }, null);

	try {
		await adapter.createTeamMember({
			teamId: team.id as unknown as RealTeamId,
			userId: user.id,
		});
	} catch (error) {
		authContext.logger.error("Failed to create team member:", error);
		const msg = TEAMS_ERROR_CODES.FAILED_TO_CREATE_TEAM_MEMBER;
		throw APIError.from("INTERNAL_SERVER_ERROR", msg);
	}
};
