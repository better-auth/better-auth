import type { AuthContext } from "@better-auth/core";
import type { Session, User } from "@better-auth/core/db";
import { APIError } from "@better-auth/core/error";
import { ORGANIZATION_ERROR_CODES } from "../../../helpers/error-codes";
import type { RealOrganizationId } from "../../../helpers/get-org-adapter";
import type { RealTeamId } from "../helpers/get-team-adapter";
import { getTeamAdapter } from "../helpers/get-team-adapter";
import type { InferTeam, ResolvedTeamsOptions } from "../types";

export interface ValidateTeamForMemberProps {
	/**
	 * Team ID to validate (can be real ID or slug depending on config)
	 */
	teamId: string;
	/**
	 * The organization ID the team belongs to
	 */
	organizationId: RealOrganizationId;
	/**
	 * The current session for member limit checks (optional)
	 */
	session?: { session: Session; user: User } | null;
}

export interface ValidateTeamForMemberResult<O extends ResolvedTeamsOptions> {
	/**
	 * The validated team
	 */
	team: InferTeam<O>;
	/**
	 * The real team ID (resolved from slug if necessary)
	 */
	realTeamId: RealTeamId;
}

/**
 * Validate a team for adding a member.
 * Checks that the team exists and has capacity for new members.
 */
export const validateTeamForMember = async <O extends ResolvedTeamsOptions>(
	props: ValidateTeamForMemberProps,
	context: AuthContext,
	options: O,
): Promise<ValidateTeamForMemberResult<O>> => {
	const { teamId, organizationId, session } = props;

	const teamAdapter = getTeamAdapter(context, options);

	const realTeamId = await teamAdapter.getRealTeamId(teamId);
	const team = await teamAdapter.findTeamById({
		teamId,
		organizationId,
	});

	if (!team) {
		const msg = ORGANIZATION_ERROR_CODES.TEAM_NOT_FOUND;
		throw APIError.from("BAD_REQUEST", msg);
	}

	// Check maximum members per team limit if session is available
	if (session) {
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

	return {
		team: team as unknown as InferTeam<O>,
		realTeamId,
	};
};
