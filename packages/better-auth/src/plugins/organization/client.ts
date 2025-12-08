import type { BetterAuthClientPlugin } from "@better-auth/core";
import type { DBFieldAttribute } from "@better-auth/core/db";
import { atom } from "nanostores";
import { useAuthQuery } from "../../client";
import type {
	InferInvitation,
	InferMember,
	InferOrganization,
	InferTeam,
	Member,
} from "../../plugins/organization/schema";
import type { BetterAuthOptions, BetterAuthPlugin } from "../../types";
import type { Prettify } from "../../types/helper";
import type { AccessControl, Role } from "../access";
import type { defaultStatements } from "./access";
import { adminAc, defaultRoles, memberAc, ownerAc } from "./access";
import type { OrganizationPlugin } from "./organization";
import type { HasPermissionBaseInput } from "./permission";
import { hasPermissionFn } from "./permission";
import type { OrganizationOptions } from "./types";

/**
 * Using the same `hasPermissionFn` function, but without the need for a `ctx` parameter or the `organizationId` parameter.
 */
export const clientSideHasPermission = (input: HasPermissionBaseInput) => {
	const acRoles: {
		[x: string]: Role<any> | undefined;
	} = input.options.roles || defaultRoles;

	return hasPermissionFn(input, acRoles);
};

interface OrganizationClientOptions {
	ac?: AccessControl | undefined;
	roles?:
		| {
				[key in string]: Role;
		  }
		| undefined;
	teams?:
		| {
				enabled: boolean;
		  }
		| undefined;
	schema?:
		| {
				organization?: {
					additionalFields?: {
						[key: string]: DBFieldAttribute;
					};
				};
				member?: {
					additionalFields?: {
						[key: string]: DBFieldAttribute;
					};
				};
				invitation?: {
					additionalFields?: {
						[key: string]: DBFieldAttribute;
					};
				};
				team?: {
					additionalFields?: {
						[key: string]: DBFieldAttribute;
					};
				};
				organizationRole?: {
					additionalFields?: {
						[key: string]: DBFieldAttribute;
					};
				};
		  }
		| undefined;
	dynamicAccessControl?:
		| {
				enabled: boolean;
		  }
		| undefined;
}

export const organizationClient = <CO extends OrganizationClientOptions>(
	options?: CO | undefined,
) => {
	const $listOrg = atom<boolean>(false);
	const $activeOrgSignal = atom<boolean>(false);
	const $activeMemberSignal = atom<boolean>(false);
	const $activeMemberRoleSignal = atom<boolean>(false);

	type DefaultStatements = typeof defaultStatements;
	type Statements =
		CO["ac"] extends AccessControl<infer S> ? S : DefaultStatements;
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
				permissions?: never | undefined;
		  }
		| {
				permissions: PermissionType;
				permission?: never | undefined;
		  };

	const roles = {
		admin: adminAc,
		member: memberAc,
		owner: ownerAc,
		...options?.roles,
	};

	type OrganizationReturn = CO["teams"] extends { enabled: true }
		? {
				members: InferMember<CO, false>[];
				invitations: InferInvitation<CO>[];
				teams: InferTeam<CO, false>[];
			} & InferOrganization<CO, false>
		: {
				members: InferMember<CO, false>[];
				invitations: InferInvitation<CO, false>[];
			} & InferOrganization<CO, false>;

	type Schema = CO["schema"];
	return {
		id: "organization",
		$InferServerPlugin: {} as OrganizationPlugin<{
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
		}>,
		getActions: ($fetch, _$store, co) => ({
			$Infer: {
				ActiveOrganization: {} as OrganizationReturn,
				Organization: {} as InferOrganization<CO, false>,
				Invitation: {} as InferInvitation<CO, false>,
				Member: {} as InferMember<CO, false>,
				Team: {} as InferTeam<CO, false>,
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
			const listOrganizations = useAuthQuery<InferOrganization<CO, false>[]>(
				$listOrg,
				"/organization/list",
				$fetch,
				{
					method: "GET",
				},
			);
			const activeOrganization = useAuthQuery<
				Prettify<
					InferOrganization<CO, false> & {
						members: InferMember<CO, false>[];
						invitations: InferInvitation<CO, false>[];
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

			const activeMemberRole = useAuthQuery<{ role: string }>(
				[$activeMemberRoleSignal],
				"/organization/get-active-member-role",
				$fetch,
				{
					method: "GET",
				},
			);

			return {
				$listOrg,
				$activeOrgSignal,
				$activeMemberSignal,
				$activeMemberRoleSignal,
				activeOrganization,
				listOrganizations,
				activeMember,
				activeMemberRole,
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
			{
				matcher(path) {
					return path.includes("/organization/update-member-role");
				},
				signal: "$activeMemberRoleSignal",
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
	schema?: S | undefined,
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

	// The server schema can contain more properties other than additionalFields, but the client only supports additionalFields
	// if we don't remove all other properties we may see assignability issues

	type ExtractClientOnlyFields<T> = {
		[K in keyof T]: T[K] extends { additionalFields: infer AF }
			? T[K]
			: undefined;
	};

	type Schema = O extends Object
		? O extends Exclude<OrganizationOptions["schema"], undefined>
			? O
			: OrganizationPlugin extends { options: { schema: infer S } }
				? S extends OrganizationOptions["schema"]
					? ExtractClientOnlyFields<S>
					: undefined
				: undefined
		: undefined;
	return {} as undefined extends S ? Schema : S;
};

export type * from "./schema";
