import type { AuthContext } from "@better-auth/core";
import type { Session, User } from "@better-auth/core/db";
import { APIError } from "@better-auth/core/error";
import { ORGANIZATION_ERROR_CODES } from "../../../helpers/error-codes";
import type { RealOrganizationId } from "../../../helpers/get-org-adapter";
import { TEAMS_ERROR_CODES } from "../helpers/errors";
import { getTeamAdapter } from "../helpers/get-team-adapter";
import type { ResolvedTeamsOptions } from "../types";

export interface ValidateInvitationTeamsProps {
	/**
	 * Team IDs to validate (can be real IDs or slugs depending on config)
	 */
	teamIds: string[];
	/**
	 * The organization ID the teams belong to
	 */
	organizationId: RealOrganizationId;
	/**
	 * The current session for member limit checks
	 */
	session: { session: Session; user: User };
}

/**
 * Validate teams for an invitation.
 * Checks that all teams exist and have capacity for new members.
 */
export const validateInvitationTeams = async (
	props: ValidateInvitationTeamsProps,
	context: AuthContext,
	options: ResolvedTeamsOptions,
): Promise<void> => {
	const { teamIds, organizationId, session } = props;

	if (teamIds.length === 0) {
		return;
	}

	const teamAdapter = getTeamAdapter(context, options);

	for (const teamId of teamIds) {
		const realTeamId = await teamAdapter.getRealTeamId(teamId);
		const team = await teamAdapter.findTeamById({
			teamId,
			organizationId,
		});

		if (!team) {
			const code = "TEAM_NOT_FOUND";
			const msg = TEAMS_ERROR_CODES[code];
			throw APIError.from("BAD_REQUEST", msg);
		}

		// Check if team has reached maximum members limit
		const memberCount = await teamAdapter.countTeamMembers(realTeamId);
		const maxMembers = await options.maximumMembersPerTeam({
			teamId: realTeamId,
			session,
			organizationId,
		});

		if (memberCount >= maxMembers) {
			const code = "TEAM_MEMBER_LIMIT_REACHED";
			const msg = ORGANIZATION_ERROR_CODES[code];
			throw APIError.from("FORBIDDEN", msg);
		}
	}
};
