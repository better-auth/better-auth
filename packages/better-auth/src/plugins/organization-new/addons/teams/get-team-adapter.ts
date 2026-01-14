import type { AuthContext } from "@better-auth/core";
import { getCurrentAdapter } from "@better-auth/core/context";
import type { Team, TeamMember } from "./schema";
import type { ResolvedTeamsOptions } from "./types";

export const getTeamAdapter = <O extends ResolvedTeamsOptions>(
	context: AuthContext,
	options?: O | undefined,
) => {
	const baseAdapter = context.adapter;
	return {
		createTeam: async (teamData: Omit<Team, "id"> & Record<string, any>) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			type TeamData = Team & Record<string, any>;
			const team = await adapter.create<TeamData>({
				model: "team",
				data: teamData,
				forceAllowId: true,
			});
			return team;
		},
		createTeamMember: async (props: { teamId: string; userId: string }) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			type TeamMemberData = TeamMember & Record<string, any>;
			const teamMember = await adapter.create<TeamMemberData>({
				model: "teamMember",
				data: props,
				forceAllowId: true,
			});
			return teamMember;
		},
	};
};
