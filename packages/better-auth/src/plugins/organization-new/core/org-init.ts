import type { BetterAuthPlugin } from "@better-auth/core";
import type { TeamsAddon } from "../addons";
import { getAddon } from "../helpers/get-addon";
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
										ctx,
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

								const $TA = {} as TeamsAddon;
								const [teamsAddon] = getAddon(options, "teams", $TA);

								if (teamsAddon) {
									await teamsAddon.events.createDefaultTeam(
										{ organization, user },
										authContext,
										teamsAddon.options,
									);
								}

								await orgHook.after(
									{
										organization,
										member,
										user,
									},
									ctx,
								);
							},
						},
					},
				},
			},
		};
	}) satisfies BetterAuthPlugin["init"];
};
