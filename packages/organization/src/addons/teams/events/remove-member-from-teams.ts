import type { AuthContext } from "@better-auth/core";
import type { RealOrganizationId } from "../../../helpers/get-org-adapter";
import type { RealTeamId } from "../helpers/get-team-adapter";
import { getTeamAdapter } from "../helpers/get-team-adapter";
import type { ResolvedTeamsOptions } from "../types";

export interface RemoveMemberFromTeamsProps {
	/**
	 * The real organization ID
	 */
	realOrgId: RealOrganizationId;
	/**
	 * The user ID to remove from all teams
	 */
	userId: string;
}

/**
 * Remove a user from all teams in an organization.
 * This is typically called when a member leaves an organization.
 */
export const removeMemberFromTeams = async (
	props: RemoveMemberFromTeamsProps,
	context: AuthContext,
	options: ResolvedTeamsOptions,
): Promise<void> => {
	const { realOrgId, userId } = props;

	const teamAdapter = getTeamAdapter(context, options);
	const teams = await teamAdapter.getTeams(realOrgId);

	await Promise.all(
		teams.map((team) =>
			teamAdapter.removeTeamMember({
				teamId: team.id as RealTeamId,
				userId,
			}),
		),
	);
};
