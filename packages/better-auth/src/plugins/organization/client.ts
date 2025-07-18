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
import { defaultStatements, adminAc, memberAc, ownerAc } from "./access";
import { hasPermission } from "./has-permission";
import type { OrganizationOptions } from "./types";
import type { BetterAuthOptions } from "../../types";

interface OrganizationClientOptions {
	ac?: AccessControl;
	roles?: {
		[key in string]: Role;
	};
	teams?: {
		enabled: boolean;
	};
}

export const organizationClient = <
	Auth extends { options: { plugins: { id: string; options: any }[] } },
	CO extends OrganizationClientOptions = OrganizationClientOptions,
>(
	options?: CO,
) => {
	const $listOrg = atom<boolean>(false);
	const $activeOrgSignal = atom<boolean>(false);
	const $activeMemberSignal = atom<boolean>(false);

	type DefaultStatements = typeof defaultStatements;
	type Statements = CO["ac"] extends AccessControl<infer S>
		? S
		: DefaultStatements;
	type PermissionType = {
		[key in keyof Statements]?: Array<
			Statements[key] extends readonly unknown[]
				? Statements[key][number]
				: never
		>;
	};
	type PermissionExclusive =
		| {
				/**
				 * @deprecated Use `permissions` instead
				 */
				permission: PermissionType;
				permissions?: never;
		  }
		| {
				permissions: PermissionType;
				permission?: never;
		  };

	const roles = {
		admin: adminAc,
		member: memberAc,
		owner: ownerAc,
		...options?.roles,
	};

	type OrganizationReturn = CO["teams"] extends { enabled: true }
		? {
				members: InferMember<CO>[];
				invitations: InferInvitation<CO>[];
				teams: Team[];
			} & Organization
		: {
				members: InferMember<CO>[];
				invitations: InferInvitation<CO>[];
			} & Organization;

	type Schema = Auth["options"]["plugins"][number] extends {
		id: "organization";
		options: infer O;
	}
		? O extends { schema?: infer S }
			? O["schema"]
			: undefined
		: undefined;

	return {
		id: "organization",
		$InferServerPlugin: {} as ReturnType<
			typeof organization<{
				ac: CO["ac"] extends AccessControl
					? CO["ac"]
					: AccessControl<DefaultStatements>;
				roles: CO["roles"] extends Record<string, Role>
					? CO["roles"]
					: {
							admin: Role;
							member: Role;
							owner: Role;
						};
				teams: {
					enabled: CO["teams"] extends { enabled: true } ? true : false;
				};
				schema: Schema;
			}>
		>,
		getActions: ($fetch) => ({
			$Infer: {
				ActiveOrganization: {} as OrganizationReturn,
				Organization: {} as Organization,
				Invitation: {} as InferInvitation<CO>,
				Member: {} as InferMember<CO>,
				Team: {} as Team,
			},
			organization: {
				checkRolePermission: <
					R extends CO extends { roles: any }
						? keyof CO["roles"]
						: "admin" | "member" | "owner",
				>(
					data: PermissionExclusive & {
						role: R;
					},
				) => {
					const isAuthorized = hasPermission({
						role: data.role as string,
						options: {
							ac: options?.ac,
							roles: roles,
						},
						permissions: (data.permissions ?? data.permission) as any,
					});
					return isAuthorized;
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
					return path.startsWith("/organization/set-active");
				},
				signal: "$sessionSignal",
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
