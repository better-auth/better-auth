import { atom, computed, task } from "nanostores";
import type {
	Invitation,
	Member,
	Organization,
} from "../../plugins/organization/schema";
import type { Prettify } from "../../types/helper";
import { defaultStatements, type AccessControl, type Role } from "./access";
import type { AuthClientPlugin } from "../../client/types";
import type { organization } from "./organization";

interface OrganizationClientOptions {
	ac: AccessControl;
	roles?: {
		[key in "admin" | "member" | "owner"]?: Role<any>;
	};
}

export const organizationClient = <O extends OrganizationClientOptions>(
	options?: O,
) => {
	const activeOrgId = atom<string | null>(null);
	const _listOrg = atom<boolean>(false);
	const _activeOrgSignal = atom<boolean>(false);
	const _activeISignal = atom<string | null>(null);

	type DefaultStatements = typeof defaultStatements;
	type Statements = O["ac"] extends AccessControl<infer S>
		? S extends Record<string, Array<any>>
			? S & DefaultStatements
			: DefaultStatements
		: DefaultStatements;
	return {
		id: "organization",
		$InferServerPlugin: {} as ReturnType<typeof organization>,
		getActions: ($fetch) => ({
			organization: {
				setActive(orgId: string | null) {
					activeOrgId.set(orgId);
				},
				setInvitationId: (id: string | null) => {
					_activeISignal.set(id);
				},
				hasPermission: async (
					permission: Partial<{
						//@ts-expect-error fix this later
						[key in keyof Statements]: Statements[key][number][];
					}>,
				) => {
					return await $fetch<boolean>("/organization/has-permission", {
						method: "POST",
						body: {
							...permission,
						},
					});
				},
			},
		}),
		getAtoms: ($fetch) => {
			const listOrganizations = computed([_listOrg], () =>
				task(async () => {
					console.log("fetching organizations");
					const organizations = await $fetch<Organization[]>(
						"/organization/list",
						{
							method: "GET",
						},
					);
					return organizations.data;
				}),
			);
			const activeOrganization = computed([activeOrgId, _activeOrgSignal], () =>
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
			const invitation = computed(_activeISignal, () =>
				task(async () => {
					if (!_activeISignal.get()) {
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
							id: _activeISignal.get(),
						},
						credentials: "include",
					});
					return res;
				}),
			);
			return {
				_listOrg,
				_activeOrgSignal,
				activeOrganization,
				listOrganizations,
				invitation,
			};
		},
		atomListeners: [
			{
				matcher(path) {
					return (
						path === "/organization/create" || path === "/organization/delete"
					);
				},
				signal: "$listOrg",
			},
			{
				matcher(path) {
					return path.startsWith("/organization");
				},
				signal: "$activeOrgSignal",
			},
		],
	} satisfies AuthClientPlugin;
};
