import { atom, computed, task } from "nanostores";
import type {
	Invitation,
	Member,
	Organization,
} from "../../plugins/organization/schema";
import type { Prettify } from "../../types/helper";
import type { organization as org } from "../../plugins";
import { createClientPlugin } from "../../client/create-client-plugin";
import {
	createAccessControl,
	defaultStatements,
	type AccessControl,
	type Role,
} from "./access";

interface OrganizationClientOptions {
	ac: AccessControl;
	roles?: {
		[key in "admin" | "member" | "owner"]?: Role<any>;
	};
}

export const organizationClient = <O extends OrganizationClientOptions>(
	options?: O,
) =>
	createClientPlugin<ReturnType<typeof org>>()(($fetch) => {
		const activeOrgId = atom<string | null>(null);
		const $listOrg = atom<boolean>(false);
		const $activeOrgSignal = atom<boolean>(false);
		const $activeOrganization = computed([activeOrgId, $activeOrgSignal], () =>
			task(async () => {
				if (!activeOrgId.get()) {
					return null;
				}
				const organization = await $fetch<
					Prettify<
						Organization & {
							members: Member[];
							invitations: Invitation[];
						}
					>
				>("/organization/set-active", {
					method: "POST",
					credentials: "include",
					body: {
						orgId: activeOrgId.get(),
					},
				});
				return organization.data;
			}),
		);

		const $listOrganizations = computed($listOrg, () =>
			task(async () => {
				const organizations = await $fetch<Organization[]>(
					"/organization/list",
					{
						method: "GET",
					},
				);
				return organizations.data;
			}),
		);

		const $activeInvitationId = atom<string | null>(null);
		const $invitation = computed($activeInvitationId, () =>
			task(async () => {
				if (!$activeInvitationId.get()) {
					return {
						error: {
							message: "No invitation found",
							status: 400,
							data: null,
						},
						data: null,
					};
				}
				const res = await $fetch<
					Prettify<
						Invitation & {
							organizationName: string;
							organizationSlug: string;
							inviterEmail: string;
							inviterName: string;
						}
					>
				>("/organization/get-active-invitation", {
					method: "GET",
					query: {
						id: $activeInvitationId.get(),
					},
					credentials: "include",
				});
				return res;
			}),
		);
		type DefaultStatements = typeof defaultStatements;
		type Statements = O["ac"] extends AccessControl<infer S>
			? S extends Record<string, Array<any>>
				? S & DefaultStatements
				: DefaultStatements
			: DefaultStatements;
		return {
			id: "organization",
			actions: {
				organization: {
					setActive(orgId: string | null) {
						activeOrgId.set(orgId);
					},
					setInvitationId: (id: string | null) => {
						$activeInvitationId.set(id);
					},
					hasPermission: async (
						permission: Partial<{
							//@ts-expect-error fix this later
							[key in keyof Statements]: Statements[key][number][];
						}>,
					) => {
						await $fetch<boolean>("/organization/has-permission", {
							method: "POST",
							body: {
								permission,
							},
						});
					},
				},
			},
			integrations: {
				react(useStore) {
					return {
						organization: {
							useActiveOrganization() {
								return useStore($activeOrganization);
							},
							useListOrganization() {
								return useStore($listOrganizations);
							},
							useInvitation() {
								return useStore($invitation);
							},
						},
					};
				},
				vue(useStore) {
					return {
						useActiveOrganization() {
							return useStore($activeOrganization);
						},
						useListOrganization() {
							return useStore($listOrganizations);
						},
						useInvitation() {
							return useStore($invitation);
						},
					};
				},
				preact(useStore) {
					return {
						useActiveOrganization() {
							return useStore($activeOrganization);
						},
						useListOrganization() {
							return useStore($listOrganizations);
						},
						useInvitation() {
							return useStore($invitation);
						},
					};
				},
				svelte() {
					return {
						$activeOrganization,
						$listOrganizations,
						$invitation,
					};
				},
			},
			signals: {
				$listOrg,
				$activeOrgSignal,
			},
			authProxySignal: [
				{
					matcher(path) {
						return path.startsWith("/organization");
					},
					atom: "$listOrg",
				},
				{
					matcher(path) {
						return path.startsWith("/organization");
					},
					atom: "$activeOrgSignal",
				},
			],
		};
	});
