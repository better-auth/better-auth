import type { BetterAuthPlugin } from "@better-auth/core";
import { getAddonHook } from "../helpers/get-addon-hook";
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
								const addonHooks = getAddonHook("CreateOrganization", options);
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
									const addonMutate = await addonHooks.before(
										{
											organization: data,
											user,
										},
										ctx,
									);
									return { ...data, ...(mutate ?? {}), ...(addonMutate ?? {}) };
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

								await addonHooks.after(
									{
										organization,
										member,
										user,
									},
									ctx,
								);
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
