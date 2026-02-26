import type { AuthContext } from "@better-auth/core";
import { runWithTransaction } from "@better-auth/core/context";
import type { User } from "@better-auth/core/db";
import type { Organization } from "../../../schema";
import type { RealTeamId } from "../helpers/get-team-adapter";
import { getTeamAdapter } from "../helpers/get-team-adapter";
import { getHook } from "../helpers/get-team-hook";
import type { Team } from "../schema";
import type { InferTeam, ResolvedTeamsOptions } from "../types";

/**
 * This event will create a default team after an org is created.
 */
export const createDefaultTeam = async <O extends ResolvedTeamsOptions>(
	{ user, organization }: { user: User; organization: Organization },
	authContext: AuthContext,
	options: O,
) => {
	const adapter = getTeamAdapter(authContext, options);
	const { customCreateDefaultTeam, enabled } = options.defaultTeam;
	if (!enabled) return;

	const teamData: Omit<Team, "id"> & Record<string, any> = {
		organizationId: organization.id,
		name: `${organization.name}`,
		createdAt: new Date(),
		updatedAt: new Date(),
	};

	const teamHook = getHook("CreateTeam", options);

	const team = await runWithTransaction(authContext.adapter, async () => {
		type Result = InferTeam<O> & Record<string, any>;
		let customResult: Record<string, any> = {};
		if (customCreateDefaultTeam) {
			customResult = await customCreateDefaultTeam(organization);
		}

		const teamResultData = { ...teamData, ...customResult };

		const mutate = await teamHook.before({
			team: teamResultData,
			user,
			organization,
		});
		const createdTeam = await adapter.createTeam({
			...teamResultData,
			...(mutate ?? {}),
		});

		await adapter.createTeamMember({
			teamId: createdTeam.id as unknown as RealTeamId,
			userId: user.id,
		});

		return createdTeam as unknown as Result;
	});

	await teamHook.after({ organization, team, user });
};
