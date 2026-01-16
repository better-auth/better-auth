import type { ResolvedTeamsOptions, TeamsOptions } from "./types";

const DEFAULT_MAXIMUM_MEMBERS_PER_TEAM = 100;
const DEFAULT_MAXIMUM_TEAMS = 100;

export const resolveTeamOptions = <O extends TeamsOptions>(
	options: O = {} as O,
) => {
	return {
		...options,
		defaultTeam: {
			enabled: options.defaultTeam?.enabled ?? true,
			customCreateDefaultTeam:
				options.defaultTeam?.customCreateDefaultTeam ?? undefined,
		},
		allowRemovingAllTeams: options.allowRemovingAllTeams ?? true,
		maximumMembersPerTeam: async (data) => {
			const maximumMembersPerTeam = options.maximumMembersPerTeam;
			if (typeof maximumMembersPerTeam === "function") {
				const result = await maximumMembersPerTeam(data);
				return result ?? DEFAULT_MAXIMUM_MEMBERS_PER_TEAM;
			}
			return maximumMembersPerTeam ?? DEFAULT_MAXIMUM_MEMBERS_PER_TEAM;
		},
		maximumTeams: async (data) => {
			const maximumTeams = options.maximumTeams;
			if (typeof maximumTeams === "function") {
				const result = await maximumTeams(data);
				return result ?? DEFAULT_MAXIMUM_TEAMS;
			}
			return maximumTeams ?? DEFAULT_MAXIMUM_TEAMS;
		},
	} satisfies ResolvedTeamsOptions;
};
