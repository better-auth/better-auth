import type { ResolvedTeamsOptions, TeamsOptions } from "../types";

const DEFAULT_MAXIMUM_MEMBERS_PER_TEAM = 100;
const DEFAULT_MAXIMUM_TEAMS = 100;

export const resolveTeamOptions = <O extends TeamsOptions>(
	options: O = {} as O,
) => {
	return {
		...options,
		defaultTeam: {
			enabled: options.defaultTeam?.enabled ?? true,
			customCreateDefaultTeam: async (organization, ctx) => {
				const defaultTeam = options.defaultTeam;
				const customCreateDefaultTeam = defaultTeam?.customCreateDefaultTeam;
				if (customCreateDefaultTeam) {
					return await customCreateDefaultTeam(organization, ctx);
				}
				return {
					organizationId: organization.id,
					name: `${organization.name}'s Team`,
					createdAt: new Date(),
				};
			},
		},
		allowRemovingAllTeams: options.allowRemovingAllTeams ?? false,
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
		defaultTeamIdField: options.defaultTeamIdField ?? "id",
		enableSlugs: options.enableSlugs ?? false,
	} satisfies ResolvedTeamsOptions;
};
