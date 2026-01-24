import type { GenericEndpointContext } from "@better-auth/core";
import type { User } from "@better-auth/core/db";
import { APIError } from "@better-auth/core/error";
import type { Organization } from "../../schema";
import { TEAMS_ERROR_CODES } from "./helpers/errors";
import { getTeamAdapter } from "./helpers/get-team-adapter";
import { getHook } from "./helpers/get-team-hook";
import type { Team } from "./schema";
import type { InferTeam, ResolvedTeamsOptions } from "./types";

export const createDefaultTeam = async <O extends ResolvedTeamsOptions>(
	{ user, organization }: { user: User; organization: Organization },
	ctx: GenericEndpointContext,
	options: O,
) => {
	const adapter = getTeamAdapter(ctx.context, options);
	const { customCreateDefaultTeam, enabled } = options.defaultTeam;
	if (!enabled) return;

	const teamData: Omit<Team, "id"> & Record<string, any> = {
		organizationId: organization.id,
		name: `${organization.name}`,
		createdAt: new Date(),
		updatedAt: new Date(),
	};

	const teamHook = getHook("CreateTeam", options);

	let team: Omit<InferTeam<O>, "id"> & Record<string, any>;
	try {
		team = await (async () => {
			type Result = Omit<InferTeam<O>, "id"> & Record<string, any>;
			if (customCreateDefaultTeam) {
				const result = await customCreateDefaultTeam(organization, ctx);
				return result as unknown as Result;
			}
			const mutate = await teamHook.before({
				team: teamData,
				user,
				organization,
			});
			const result = await adapter.createTeam({
				...teamData,
				...(mutate ?? {}),
			});
			return result as unknown as Result;
		})();
	} catch (error) {
		ctx.context.logger.error("Failed to create default team:", error);
		const msg = TEAMS_ERROR_CODES.FAILED_TO_CREATE_TEAM;
		throw APIError.from("INTERNAL_SERVER_ERROR", msg);
	}

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
};
