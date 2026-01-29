import type { AuthContext } from "@better-auth/core";
import { getCurrentAdapter } from "@better-auth/core/context";
import { filterOutputFields } from "../../../helpers/filter-output-fields";
import type { RealOrganizationId } from "../../../helpers/get-org-adapter";
import type { Team, TeamMember } from "../schema";
import type { InferTeam, InferTeamMember, TeamsOptions } from "../types";
import { resolveTeamOptions } from "./resolve-team-options";
import { TEAMS_ERROR_CODES } from "./errors";
import { APIError } from "../../../../..";

export type RealTeamId = string & { __realTeamId: true };

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
		createTeamMember: async (props: { teamId: RealTeamId; userId: string }) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			type TeamMemberData = TeamMember & Record<string, any>;
			const teamMember = await adapter.create<TeamMemberData>({
				model: "teamMember",
				data: props,
				forceAllowId: true,
			});
			return filterTeamMemberOutput(teamMember);
		},
		getTeamCount: async (organizationId: RealOrganizationId) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const count = await adapter.count({
				model: "team",
				where: [{ field: "organizationId", value: organizationId }],
			});
			return count;
		},
		getTeams: async (organizationId: RealOrganizationId) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const teams = await adapter.findMany<InferTeam<O, false>>({
				model: "team",
				where: [{ field: "organizationId", value: organizationId }],
			});
			return teams.map(filterTeamOutput);
		},
		findTeamById: async ({
			teamId,
			organizationId,
		}: {
			teamId: string;
			organizationId: RealOrganizationId;
		}) => {
			const field = options.defaultTeamIdField;
			const adapter = await getCurrentAdapter(baseAdapter);
			const team = await adapter.findOne<InferTeam<O, false>>({
				model: "team",
				where: [
					{ field: field, value: teamId },
					{ field: "organizationId", value: organizationId },
				],
			});
			return filterTeamOutput(team);
		},
		getRealTeamId: async (teamId: string): Promise<RealTeamId> => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const field = options.defaultTeamIdField;
			if (field === "id") return teamId as RealTeamId;
			const value = teamId;
			const team = await adapter.findOne<{ id: string }>({
				model: "team",
				where: [{ field, value }],
				select: ["id"],
			});
			if (!team) {
				const msg = TEAMS_ERROR_CODES.TEAM_NOT_FOUND;
				throw APIError.from("BAD_REQUEST", msg);
			}
			return team.id as RealTeamId;
		},
		countTeams: async (organizationId: RealOrganizationId) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const count = await adapter.count({
				model: "team",
				where: [{ field: "organizationId", value: organizationId }],
			});
			return count;
		},
		deleteTeam: async (teamId: RealTeamId) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			await adapter.deleteMany({
				model: "teamMember",
				where: [{ field: "teamId", value: teamId }],
			});
			await adapter.delete({
				model: "team",
				where: [{ field: "id", value: teamId }],
			});
		},
	};
};
