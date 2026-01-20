import type { AuthContext } from "@better-auth/core";
import { getCurrentAdapter } from "@better-auth/core/context";
import type { TeamMember } from "../schema";
import type { InferTeam, TeamsOptions } from "../types";

export const getTeamAdapter = <O extends TeamsOptions>(
	context: AuthContext,
	options?: O | undefined,
) => {
	const baseAdapter = context.adapter;

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
		createTeam: async (
			teamData: Omit<InferTeam<O>, "id"> & Record<string, any>,
		) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const team = await adapter.create<InferTeam<O>>({
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
			return teams;
		},
	};
};
