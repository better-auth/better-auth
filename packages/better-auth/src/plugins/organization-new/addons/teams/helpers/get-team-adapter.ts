import type { AuthContext } from "@better-auth/core";
import { getCurrentAdapter } from "@better-auth/core/context";
import { filterOutputFields } from "../../../helpers/filter-output-fields";
import type { Team, TeamMember } from "../schema";
import type { InferTeam, InferTeamMember, TeamsOptions } from "../types";
import { resolveTeamOptions } from "./resolve-team-options";

export const getTeamAdapter = <O extends TeamsOptions>(
	context: AuthContext,
	_options?: O | undefined,
) => {
	const baseAdapter = context.adapter;
	const options = resolveTeamOptions(_options);
	const schema = options.schema || {};

	const filterTeamOutput = (team: Record<string, any> | null) => {
		if (!team) return null;
		const teamAdditionalFields = schema.team?.additionalFields;
		const result = filterOutputFields(team, teamAdditionalFields);
		return result as InferTeam<O, false> | null;
	};

	const filterTeamMemberOutput = (teamMember: Record<string, any> | null) => {
		if (!teamMember) return null;
		const teamMemberAdditionalFields = schema.teamMember?.additionalFields;
		const result = filterOutputFields(teamMember, teamMemberAdditionalFields);
		return result as InferTeamMember<O, false> | null;
	};

	return {
		isSlugTaken: async (slug: string) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const team = await adapter.findOne({
				model: "team",
				where: [{ field: "slug", value: slug }],
				select: ["id"],
			});
			return team ? true : false;
		},
		createTeam: async (teamData: Omit<Team, "id"> & Record<string, any>) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const team = await adapter.create<Team, InferTeam<O, false>>({
				model: "team",
				data: teamData,
				forceAllowId: true,
			});
			return filterTeamOutput(team) as InferTeam<O, false>;
		},
		createTeamMember: async (props: { teamId: string; userId: string }) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			type TeamMemberData = TeamMember & Record<string, any>;
			const teamMember = await adapter.create<TeamMemberData>({
				model: "teamMember",
				data: props,
				forceAllowId: true,
			});
			return filterTeamMemberOutput(teamMember);
		},
		getTeamCount: async (organizationId: string) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const count = await adapter.count({
				model: "team",
				where: [{ field: "organizationId", value: organizationId }],
			});
			return count;
		},
		getTeams: async (organizationId: string) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const teams = await adapter.findMany<InferTeam<O>>({
				model: "team",
				where: [{ field: "organizationId", value: organizationId }],
			});
			return teams.map(filterTeamOutput);
		},
	};
};
