import type { AuthContext } from "@better-auth/core";
import { APIError } from "@better-auth/core/error";
import type { Session, User } from "@better-auth/core/db";
import type { Invitation } from "../../../schema";
import { ORGANIZATION_ERROR_CODES } from "../../../helpers/error-codes";
import type { RealTeamId } from "../helpers/get-team-adapter";
import { getTeamAdapter } from "../helpers/get-team-adapter";
import type { ResolvedTeamsOptions } from "../types";

export interface AcceptInvitationForTeamsProps {
	/**
	 * The accepted invitation with teamId field
	 */
	invitation: Invitation & { teamId?: string };
	/**
	 * The user accepting the invitation
	 */
	user: User;
	/**
	 * The current session
	 */
	session: Session;
	/**
	 * Organization ID from the invitation
	 */
	organizationId: string;
	/**
	 * Function to set the active team on the session
	 */
	setActiveTeam: (
		sessionToken: string,
		teamId: RealTeamId,
	) => Promise<Session | null>;
}

export interface AcceptInvitationForTeamsResult {
	/**
	 * Updated session if active team was set, null otherwise
	 */
	updatedSession: Session | null;
}

/**
 * Handle team-specific logic when accepting an organization invitation.
 * Adds the user to specified teams and optionally sets the active team.
 */
export const acceptInvitationForTeams = async (
	props: AcceptInvitationForTeamsProps,
	context: AuthContext,
	options: ResolvedTeamsOptions,
): Promise<AcceptInvitationForTeamsResult> => {
	const { invitation, user, session, organizationId, setActiveTeam } = props;

	if (!invitation.teamId) {
		return { updatedSession: null };
	}

	const teamAdapter = getTeamAdapter(context, options);
	const teamIds = invitation.teamId.split(",") as RealTeamId[];
	const onlyOne = teamIds.length === 1;

	for (const teamId of teamIds) {
		const maxMembers = await options.maximumMembersPerTeam({
			teamId,
			session: { session, user },
			organizationId,
		});

		const members = await teamAdapter.countTeamMembers(teamId);

		if (members >= maxMembers) {
			const code = "TEAM_MEMBER_LIMIT_REACHED";
			const msg = ORGANIZATION_ERROR_CODES[code];
			throw APIError.from("FORBIDDEN", msg);
		}

		await teamAdapter.findOrCreateTeamMember({
			teamId: teamId,
			userId: user.id,
		});
	}

	// If invited to only one team, set it as active
	if (onlyOne) {
		const teamId = teamIds[0]!;
		const updatedSession = await setActiveTeam(session.token, teamId);
		return { updatedSession };
	}

	return { updatedSession: null };
};
