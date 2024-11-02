import { atom } from "nanostores";
import type {
	Invitation,
	Member,
	Organization,
} from "../../plugins/organization/schema";
import type { Prettify } from "../../types/helper";
import { defaultStatements, type AccessControl, type Role } from "../access";
import type { BetterAuthClientPlugin } from "../../client/types";
import type { organization } from "./organization";
import type { BetterFetchOption } from "@better-fetch/fetch";
import { useAuthQuery } from "../../client";

interface OrganizationClientOptions {
	ac: AccessControl;
	roles?: {
		[key in "admin" | "member" | "owner"]?: Role<any>;
	};
}

export const organizationClient = <O extends OrganizationClientOptions>(
	options?: O,
) => {
	const activeOrgId = atom<string | null | undefined>(undefined);
	const $listOrg = atom<boolean>(false);
	const $activeOrgSignal = atom<boolean>(false);

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
			$Infer: {
				ActiveOrganization: {} as Prettify<
					Organization & {
						members: Prettify<
							Member & {
								user: {
									id: string;
									name: string;
									email: string;
									image: string;
								};
							}
						>[];
						invitations: Invitation[];
					}
				>,
				Organization: {} as Organization,
				Invitation: {} as Invitation,
				Member: {} as Member,
			},
			organization: {
				setActive(orgId: string | null) {
					activeOrgId.set(orgId);
				},
				hasPermission: async (data: {
					permission: Partial<{
						//@ts-expect-error fix this later
						[key in keyof Statements]: Statements[key][number][];
					}>;
					fetchOptions?: BetterFetchOption;
				}) => {
					return await $fetch<{
						success: boolean;
					}>("/organization/has-permission", {
						method: "POST",
						body: {
							permission: data.permission,
						},
						...data.fetchOptions,
					});
				},
			},
		}),
		getAtoms: ($fetch) => {
			const listOrganizations = useAuthQuery<Organization[]>(
				$listOrg,
				"/organization/list",
				$fetch,
				{
					method: "GET",
				},
			);
			const activeOrganization = useAuthQuery<
				Prettify<
					Organization & {
						members: (Member & {
							user: {
								id: string;
								name: string;
								email: string;
								image: string;
							};
						})[];
						invitations: Invitation[];
					}
				>
			>(
				[activeOrgId, $activeOrgSignal],
				"/organization/activate",
				$fetch,
				() => ({
					method: "POST",
					body: {
						orgId: activeOrgId.get(),
					},
				}),
			);

			return {
				$listOrg,
				$activeOrgSignal,
				activeOrganization,
				listOrganizations,
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
	} satisfies BetterAuthClientPlugin;
};
