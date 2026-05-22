import type { AuthContext } from "@better-auth/core";
import {
	getCurrentAdapter,
	runWithTransaction,
} from "@better-auth/core/context";
import type { RealOrganizationId } from "../../../helpers/get-org-adapter";
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

	if (teams.length === 0) return;

	await runWithTransaction(context.adapter, async () => {
		const adapter = await getCurrentAdapter(context.adapter);
		await adapter.deleteMany({
			model: "teamMember",
			where: [
				{ field: "userId", value: userId },
				{
					field: "teamId",
					value: teams.map((team) => team.id),
					operator: "in",
				},
			],
		});
	});
};
