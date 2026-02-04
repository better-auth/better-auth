import type { BetterAuthPlugin } from "@better-auth/core";
import type { Team, TeamMember, TeamsAddon } from "../addons";
import { resolveTeamOptions } from "../addons/teams/helpers/resolve-team-options";
import { resolveOrgOptions } from "../helpers/resolve-org-options";
import type { Member, Organization } from "../schema";
import type { OrganizationOptions } from "../types";

export const getOrgInit = (opts: OrganizationOptions) => {
	return (async (authContext) => {
		const options = resolveOrgOptions(opts);
		const adapter = authContext.adapter;
		return {
			options: {
				databaseHooks: {
					user: {
						create: {
							after: async (user, ctx) => {
								const now = new Date();
								const data = await options.createOrgOnSignUp({ user, ctx });
								if (!data) return;

								// Create organization
								const organization = await adapter.create<Organization>({
									data: {
										createdAt: now,
										name: `${user.name}'s Organization`,
										slug: `org-${user.id}`,
										...data,
									},
									model: "organization",
									forceAllowId: true,
								});
								await adapter.create<Member>({
									data: {
										userId: user.id,
										organizationId: organization.id,
										role: options.creatorRole,
										createdAt: now,
									},
									model: "member",
									forceAllowId: true,
								});

								// Team support
								type T = TeamsAddon | undefined;
								const teamAddon = options.use.find((a) => a.id == "teams") as T;

								if (teamAddon) {
									const { defaultTeam } = resolveTeamOptions(teamAddon.options);
									const { customCreateDefaultTeam, enabled } = defaultTeam;
									if (!enabled) return;
									const data = await customCreateDefaultTeam(organization);

									// Create default team
									const team = await adapter.create<Team>({
										data: {
											organizationId: organization.id,
											name: `${organization.name}`,
											createdAt: now,
											...data,
										},
										model: "team",
										forceAllowId: true,
									});
									await adapter.create<TeamMember>({
										data: {
											teamId: team.id,
											userId: user.id,
											createdAt: now,
										},
										model: "teamMember",
										forceAllowId: true,
									});
								}
							},
						},
					},
				},
			},
		};
	}) satisfies BetterAuthPlugin["init"];
};
