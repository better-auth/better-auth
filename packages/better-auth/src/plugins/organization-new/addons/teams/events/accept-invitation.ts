import type { AuthContext } from "@better-auth/core";
import type { User } from "@better-auth/core/db";
import type { Invitation } from "../../../schema";

interface AcceptInvitationForTeamsProps {
	invitation: Invitation;
	user: User;
}

export const acceptInvitationForTeams = async (
	props: AcceptInvitationForTeamsProps,
	context: AuthContext,
) => {
	console.log(props, context);
};
