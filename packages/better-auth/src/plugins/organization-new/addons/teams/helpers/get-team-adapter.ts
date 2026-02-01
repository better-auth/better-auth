import type { AuthContext } from "@better-auth/core";
import { getCurrentAdapter } from "@better-auth/core/context";
import { APIError } from "../../../../..";
import { filterOutputFields } from "../../../helpers/filter-output-fields";
import type { RealOrganizationId } from "../../../helpers/get-org-adapter";
import type { Team, TeamMember } from "../schema";
import type { InferTeam, InferTeamMember, TeamsOptions } from "../types";
import { TEAMS_ERROR_CODES } from "./errors";
import { resolveTeamOptions } from "./resolve-team-options";

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
		listTeams: async ({
			organizationId,
			limit,
			offset,
			sortBy,
			sortDirection,
		}: {
			organizationId: RealOrganizationId;
			limit?: number;
			offset?: number;
			sortBy?: "createdAt" | "name" | "updatedAt";
			sortDirection?: "asc" | "desc";
		}) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const teams = await adapter.findMany<InferTeam<O, false>>({
				model: "team",
				where: [{ field: "organizationId", value: organizationId }],
				limit: limit,
				offset: offset,
				sortBy: sortBy
					? { field: sortBy, direction: sortDirection || "desc" }
					: undefined,
			});
			const total = await adapter.count({
				model: "team",
				where: [{ field: "organizationId", value: organizationId }],
			});
			return {
				teams: teams.map(filterTeamOutput),
				total,
			};
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
		updateTeam: async (teamId: RealTeamId, updates: Record<string, any>) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const team = await adapter.update<InferTeam<O, false>>({
				model: "team",
				where: [{ field: "id", value: teamId }],
				update: updates,
			});
			return filterTeamOutput(team);
		},
		findTeamMember: async ({
			teamId,
			userId,
		}: {
			teamId: RealTeamId;
			userId: string;
		}) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const teamMember = await adapter.findOne<InferTeamMember<O, false>>({
				model: "teamMember",
				where: [
					{ field: "teamId", value: teamId },
					{ field: "userId", value: userId },
				],
			});
			return filterTeamMemberOutput(teamMember);
		},
		listTeamsByUser: async ({
			userId,
			limit,
			offset,
		}: {
			userId: string;
			limit?: number;
			offset?: number;
		}) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			type TeamMemberWithTeam = InferTeamMember<O, false> & {
				team: InferTeam<O, false>;
			};
			const results = await adapter.findMany<TeamMemberWithTeam>({
				model: "teamMember",
				where: [{ field: "userId", value: userId }],
				join: {
					team: true,
				},
				limit: limit,
				offset: offset,
			});
			const total = await adapter.count({
				model: "teamMember",
				where: [{ field: "userId", value: userId }],
			});
			return {
				teams: results.map((result) => filterTeamOutput(result.team)),
				total,
			};
		},
		listTeamMembers: async ({
			teamId,
			limit,
			offset,
			sortBy,
			sortDirection,
		}: {
			teamId: RealTeamId;
			limit?: number;
			offset?: number;
			sortBy?: "createdAt";
			sortDirection?: "asc" | "desc";
		}) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const members = await adapter.findMany<InferTeamMember<O, false>>({
				model: "teamMember",
				where: [{ field: "teamId", value: teamId }],
				limit: limit,
				offset: offset,
				sortBy: sortBy
					? { field: sortBy, direction: sortDirection || "desc" }
					: undefined,
			});
			const total = await adapter.count({
				model: "teamMember",
				where: [{ field: "teamId", value: teamId }],
			});
			return {
				members: members.map(filterTeamMemberOutput),
				total,
			};
		},
		removeTeamMember: async ({
			teamId,
			userId,
		}: {
			teamId: RealTeamId;
			userId: string;
		}) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			await adapter.delete({
				model: "teamMember",
				where: [
					{ field: "teamId", value: teamId },
					{ field: "userId", value: userId },
				],
			});
		},
	};
};
