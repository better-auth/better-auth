import type { BetterAuthPlugin } from "@better-auth/core";
import type { Team, TeamMember, TeamsAddon } from "../addons";
import { getHook as getTeamHook } from "../addons/teams/helpers/get-team-hook";
import { resolveTeamOptions } from "../addons/teams/helpers/resolve-team-options";
import { getHook as getOrgHook } from "../helpers/get-hook";
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
								const providedData = await options.createOrgOnSignUp({
									user,
									ctx,
								});
								if (!providedData) return;

								const orgHook = getOrgHook("CreateOrganization", options);

								const customData = await (async () => {
									const slug = options.disableSlugs
										? undefined
										: `org-${user.id}`;

									const data = {
										createdAt: now,
										name: `${user.name}'s Organization`,
										slug,
										...providedData,
									} as Omit<Organization, "id">;
									const mutate = await orgHook.before(
										{ organization: data, user },
										null,
									);
									return { ...data, ...(mutate ?? {}) };
								})();

								// Create organization
								const organization = await adapter.create<Organization>({
									data: customData,
									model: "organization",
									forceAllowId: true,
								});
								const member = await adapter.create<Member>({
									data: {
										userId: user.id,
										organizationId: organization.id,
										role: options.creatorRole,
										createdAt: now,
									},
									model: "member",
									forceAllowId: true,
								});

								await orgHook.after(
									{
										organization,
										member,
										user,
									},
									null,
								);

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
										const slug = teamOptions.enableSlugs
											? `${organization.name}s-team`
											: undefined;

										const data = {
											...(customCreateDefaultTeam
												? await customCreateDefaultTeam(organization)
												: {}),
											organizationId: organization.id,
											slug,
											name: `${organization.name}'s Team`,
											createdAt: now,
										} satisfies Omit<Team & { slug?: string }, "id">;

										const mutate = await teamHook.before(
											{
												organization,
												team: data,
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
										data: customData,
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
