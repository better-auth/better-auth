import { atom, computed, task } from "nanostores";
import type {
	Invitation,
	Member,
	Organization,
} from "../../plugins/organization/schema";
import type { Prettify } from "../../types/helper";
import type { organization as org } from "../../plugins";
import { createClientPlugin } from "../create-client-plugin";

export const organization = createClientPlugin<ReturnType<typeof org>>()(
	($fetch) => {
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
		return {
			id: "organization",
			actions: {
				setActiveOrganization(orgId: string | null) {
					activeOrgId.set(orgId);
				},
				setInvitationId: (id: string | null) => {
					$activeInvitationId.set(id);
				},
			},
			integrations: {
				react(useStore) {
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
			},
			signals: {
				$listOrg,
				$activeOrgSignal,
			},
		};
	},
);
