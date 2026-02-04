import type { BetterAuthPlugin } from "@better-auth/core";
import type { Team, TeamMember, TeamsAddon } from "../addons";
import { getHook as getTeamHook } from "../addons/teams/helpers/get-team-hook";
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
									const teamOptions = resolveTeamOptions(teamAddon.options);
									const { defaultTeam } = teamOptions;
									const { customCreateDefaultTeam, enabled } = defaultTeam;
									if (!enabled) return;

									const teamHook = getTeamHook("CreateTeam", teamOptions);

									// Get custom team data if provided, otherwise use empty object
									const customData = await (async () => {
										const data = customCreateDefaultTeam
											? await customCreateDefaultTeam(organization)
											: {};

										const mutate = await teamHook.before(
											{
												organization,
												team: {
													organizationId: organization.id,
													slug: `${organization.name}s-team`,
													name: `${organization.name}'s Team`,
												},
											},
											null,
										);
										return {
											...data,
											...(mutate ?? {}),
										};
									})();

									// Create default team
									const team = await adapter.create<Team & { slug?: string }>({
										data: {
											organizationId: organization.id,
											slug: `${organization.name}s-team`,
											name: `${organization.name}'s Team`,
											createdAt: now,
											...customData,
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

									await teamHook.after(
										{
											organization,
											team,
											user,
										},
										null,
									);
								}
							},
						},
					},
				},
			},
		};
	}) satisfies BetterAuthPlugin["init"];
};
