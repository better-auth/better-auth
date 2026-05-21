import type { AuthContext, GenericEndpointContext } from "@better-auth/core";
import type { User } from "@better-auth/core/db";
import type { Organization } from "../../../schema";
import type { RealTeamId } from "../helpers/get-team-adapter";
import { getTeamAdapter } from "../helpers/get-team-adapter";
import { getHook } from "../helpers/get-team-hook";
import type { Team, TeamMember } from "../schema";
import type { ResolvedTeamsOptions } from "../types";

export interface AddMemberToTeamProps {
	/**
	 * The real team ID
	 */
	realTeamId: RealTeamId;
	/**
	 * The validated team
	 */
	team: Team & Record<string, any>;
	/**
	 * The user to add to the team
	 */
	user: User;
	/**
	 * The organization the team belongs to
	 */
	organization: Organization;
	/**
	 * The endpoint context for hooks
	 */
	endpointContext: GenericEndpointContext;
	/**
	 * Additional fields to set on the team member
	 */
	additionalFields?: Record<string, any>;
}

export interface AddMemberToTeamResult {
	/**
	 * The created team member, or null if creation failed
	 */
	teamMember: (TeamMember & Record<string, unknown>) | null;
}

/**
 * Add a user to a team.
 * Runs the AddTeamMember hooks before and after creation.
 */
export const addMemberToTeam = async (
	props: AddMemberToTeamProps,
	context: AuthContext,
	options: ResolvedTeamsOptions,
): Promise<AddMemberToTeamResult> => {
	const {
		realTeamId,
		team,
		user,
		organization,
		endpointContext,
		additionalFields,
	} = props;

	const teamAdapter = getTeamAdapter(context, options);
	const addTeamMemberHook = getHook("AddTeamMember", options);

	let teamMemberData: { teamId: string; userId: string } & Record<string, any> =
		{
			teamId: realTeamId,
			userId: user.id,
			...(additionalFields || {}),
		};

	const teamModify = await addTeamMemberHook.before(
		{
			teamMember: teamMemberData,
			team,
			user,
			organization,
		},
		endpointContext,
	);

	if (teamModify) {
		teamMemberData = {
			...teamMemberData,
			...teamModify,
		};
	}

	const teamMember = await teamAdapter.createTeamMember(
		teamMemberData as { teamId: RealTeamId; userId: string },
	);

	if (teamMember) {
		await addTeamMemberHook.after(
			{
				teamMember,
				team,
				user,
				organization,
			},
			endpointContext,
		);
	}

	return {
		teamMember: teamMember as AddMemberToTeamResult["teamMember"],
	};
};
