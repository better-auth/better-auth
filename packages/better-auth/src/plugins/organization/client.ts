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
import { organization } from "./organization";
import { useAuthQuery } from "../../client";
import { defaultStatements, adminAc, memberAc, ownerAc } from "./access";
import { clientSideHasPermission } from "./has-permission";
import type { FieldAttribute } from "../../db";
import type { BetterAuthOptions, BetterAuthPlugin } from "../../types";
import type { OrganizationOptions } from "./types";

interface OrganizationClientOptions {
	ac?: AccessControl;
	roles?: {
		[key in string]: Role;
	};
	teams?: {
		enabled: boolean;
	};
	schema?: {
		organization?: {
			additionalFields?: {
				[key: string]: FieldAttribute;
			};
		};
		member?: {
			additionalFields?: {
				[key: string]: FieldAttribute;
			};
		};
		invitation?: {
			additionalFields?: {
				[key: string]: FieldAttribute;
			};
		};
		team?: {
			additionalFields?: {
				[key: string]: FieldAttribute;
			};
		};
		organizationRole?: {
			additionalFields?: {
				[key: string]: FieldAttribute;
			};
		};
	};
	dynamicAccessControl?: {
		enabled: boolean;
	};
}

export const organizationClient = <CO extends OrganizationClientOptions>(
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

	type Schema = CO["schema"];
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
				dynamicAccessControl: {
					enabled: CO["dynamicAccessControl"] extends { enabled: true }
						? true
						: false;
				};
			}>
		>,
		getActions: ($fetch, _$store, co) => ({
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
					const isAuthorized = clientSideHasPermission({
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
			"/organization/list-user-teams": "GET",
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

export const inferOrgAdditionalFields = <
	O extends {
		options: BetterAuthOptions;
	},
	S extends OrganizationOptions["schema"] = undefined,
>(
	schema?: S,
) => {
	type FindById<
		T extends readonly BetterAuthPlugin[],
		TargetId extends string,
	> = Extract<T[number], { id: TargetId }>;

	type Auth = O extends { options: any } ? O : { options: { plugins: [] } };

	type OrganizationPlugin = FindById<
		// @ts-expect-error
		Auth["options"]["plugins"],
		"organization"
	>;
	type Schema = O extends Object
		? O extends Exclude<OrganizationOptions["schema"], undefined>
			? O
			: OrganizationPlugin extends { options: { schema: infer S } }
				? S extends OrganizationOptions["schema"]
					? S
					: undefined
				: undefined
		: undefined;
	return {} as undefined extends S ? Schema : S;
};
