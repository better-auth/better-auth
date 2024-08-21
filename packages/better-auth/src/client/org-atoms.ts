import { BetterFetch } from "@better-fetch/fetch";
import { BetterAuth } from "../auth";
import { Atom, atom, computed, task } from "nanostores";
import { Prettify } from "../types/helper";
import {
	Invitation,
	Member,
	Organization,
} from "../plugins/organization/schema";

export function getOrganizationAtoms($fetch: BetterFetch, $session: Atom) {
	const $listOrg = atom<boolean>(false);
	const activeOrgId = atom<string | null>(null);
	const $activeOrganization = computed(activeOrgId, () =>
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
			>("/organization/full", {
				method: "GET",
				credentials: "include",
			});
			return organization.data;
		}),
	);

	const $listOrganizations = computed($listOrg, () =>
		task(async () => {
			const organizations = await $fetch<Organization[]>("/list/organization", {
				method: "GET",
			});
			return organizations.data;
		}),
	);

	return {
		$listOrganizations,
		$activeOrganization,
		activeOrgId,
		$listOrg,
	};
}
