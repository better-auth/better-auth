import { BetterFetch, BetterFetchError } from "@better-fetch/fetch";
import { Atom, atom, computed, onMount, task } from "nanostores";
import { Prettify } from "../../types/helper";
import {
	Invitation,
	Member,
	Organization,
} from "../../plugins/organization/schema";

export function getOrganizationAtoms($fetch: BetterFetch, $session: Atom) {
	const $listOrg = atom<boolean>(false);
	const activeOrgId = atom<string | null>(null);
	const $activeOrgSignal = atom<boolean>(false);
	const $activeOrganization = computed([activeOrgId, $activeOrgSignal], () =>
		task(async () => {
			if (!activeOrgId.get()) {
				return null;
			}
			const session = $session.get();
			if (!session) {
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
			const organizations = await $fetch<Organization[]>("/organization/list", {
				method: "GET",
			});
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
		$listOrganizations,
		$activeOrganization,
		activeOrgId,
		$listOrg,
		$activeOrgSignal,
		$activeInvitationId,
		$invitation,
	};
}
