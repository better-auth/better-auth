import { atom } from "nanostores";
import type {
	InferInvitation,
	InferMember,
	Invitation,
	Member,
	Organization,
	Team,
} from "../../plugins/organization/schema";
import type { Prettify } from "../../types/helper";
import { type AccessControl, type Role } from "../access";
import type { BetterAuthClientPlugin } from "../../client/types";
import type { organization } from "./organization";
import { useAuthQuery } from "../../client";
import { BetterAuthError } from "../../error";
import { defaultStatements, adminAc, memberAc, ownerAc } from "./access";

interface OrganizationClientOptions {
	ac?: AccessControl;
	roles?: {
		[key in string]: Role;
	};
	teams?: {
		enabled: boolean;
	};
}

export const organizationClient = <O extends OrganizationClientOptions>(
	options?: O,
) => {
	const $listOrg = atom<boolean>(false);
	const $activeOrgSignal = atom<boolean>(false);
	const $activeMemberSignal = atom<boolean>(false);

	type DefaultStatements = typeof defaultStatements;
	type Statements = O["ac"] extends AccessControl<infer S>
		? S extends Record<string, Array<any>>
			? S & DefaultStatements
			: DefaultStatements
		: DefaultStatements;
	const roles = {
		admin: adminAc,
		member: memberAc,
		owner: ownerAc,
		...options?.roles,
	};

	type OrganizationReturn = O["teams"] extends { enabled: true }
		? {
				members: InferMember<O>[];
				invitations: InferInvitation<O>[];
				teams: Team[];
			} & Organization
		: {
				members: InferMember<O>[];
				invitations: InferInvitation<O>[];
			} & Organization;
	return {
		id: "organization",
		$InferServerPlugin: {} as ReturnType<
			typeof organization<{
				ac: O["ac"] extends AccessControl
					? O["ac"]
					: AccessControl<DefaultStatements>;
				roles: O["roles"] extends Record<string, Role>
					? O["roles"]
					: {
							admin: Role;
							member: Role;
							owner: Role;
						};
				teams: {
					enabled: O["teams"] extends { enabled: true } ? true : false;
				};
			}>
		>,
		getActions: ($fetch) => ({
			$Infer: {
				ActiveOrganization: {} as OrganizationReturn,
				Organization: {} as Organization,
				Invitation: {} as InferInvitation<O>,
				Member: {} as InferInvitation<O>,
				Team: {} as Team,
			},
			organization: {
				checkRolePermission: <
					R extends O extends { roles: any }
						? keyof O["roles"]
						: "admin" | "member" | "owner",
				>(data: {
					role: R;
					permission: {
						//@ts-expect-error fix this later
						[key in keyof Statements]?: Statements[key][number][];
					};
				}) => {
					if (Object.keys(data.permission).length > 1) {
						throw new BetterAuthError(
							"you can only check one resource permission at a time.",
						);
					}
					const role = roles[data.role as unknown as "admin"];
					if (!role) {
						return false;
					}
					const isAuthorized = role?.authorize(data.permission as any);
					return isAuthorized.success;
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
								image: string | undefined;
							};
						})[];
						invitations: Invitation[];
					}
				>
			>(
				[$activeOrgSignal],
				"/organization/get-full-organization",
				$fetch,
				() => ({
					method: "GET",
				}),
			);

			const activeMember = useAuthQuery<Member>(
				[$activeMemberSignal],
				"/organization/get-active-member",
				$fetch,
				{
					method: "GET",
				},
			);

			return {
				$listOrg,
				$activeOrgSignal,
				$activeMemberSignal,
				activeOrganization,
				listOrganizations,
				activeMember,
			};
		},
		pathMethods: {
			"/organization/get-full-organization": "GET",
		},
		atomListeners: [
			{
				matcher(path) {
					return (
						path === "/organization/create" ||
						path === "/organization/delete" ||
						path === "/organization/update"
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
			{
				matcher(path) {
					return path.includes("/organization/update-member-role");
				},
				signal: "$activeMemberSignal",
			},
		],
	} satisfies BetterAuthClientPlugin;
};
