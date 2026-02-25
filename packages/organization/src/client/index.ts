import type {
	BetterAuthClientPlugin,
	BetterAuthOptions,
	BetterAuthPlugin,
	Prettify,
} from "@better-auth/core";
import { useAuthQuery } from "better-auth/client";
import type { AccessControl, Role } from "better-auth/plugins";
import { atom } from "nanostores";
import type { defaultStatements, HasPermissionBaseInput } from "../access";
import {
	adminAc,
	defaultRoles,
	hasPermissionFn,
	memberAc,
	ownerAc,
} from "../access";
import type { InferTeam } from "../addons/teams/types";
import { ORGANIZATION_ERROR_CODES } from "../helpers/error-codes";
import type { organization } from "../organization";
import type {
	FindAddonFromOrgOptions,
	InferInvitation,
	InferMember,
	InferOrganization,
	OrganizationOptions,
} from "../types";
import type { OrganizationClientOptions } from "./types";

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
	type PermissionExclusive = {
		permissions: PermissionType;
	};

	const roles = {
		admin: adminAc,
		member: memberAc,
		owner: ownerAc,
		...options?.roles,
	};

	type OrgT = {
		schema: CO["schema"];
		use: CO["use"][number]["serverAddon"][];
	};

	type OrganizationReturn = CO extends { use: readonly [{ id: "teams" }] }
		? {
				members: InferMember<OrgT>[];
				invitations: InferInvitation<OrgT>[];
				teams: InferTeam<FindAddonFromOrgOptions<OrgT, "teams">>;
			} & InferOrganization<OrgT>
		: {
				members: InferMember<OrgT>[];
				invitations: InferInvitation<OrgT>[];
			} & InferOrganization<OrgT>;

	return {
		id: "organization",
		//@ts-expect-error - intentional
		$InferServerPlugin: {} as ReturnType<typeof organization<OrgT>>,
		getActions: ($fetch, _$store, co) => ({
			$Infer: {
				ActiveOrganization: {} as OrganizationReturn,
				Organization: {} as InferOrganization<OrgT>,
				Invitation: {} as InferInvitation<OrgT>,
				Member: {} as InferMember<OrgT>,
				Team: {} as InferTeam<FindAddonFromOrgOptions<OrgT, "teams">>,
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
						permissions: data.permissions as any,
					});
					return isAuthorized;
				},
			},
		}),
		getAtoms: ($fetch) => {
			const listOrganizations = useAuthQuery<InferOrganization<OrgT>[]>(
				$listOrg,
				"/organization/list",
				$fetch,
				{
					method: "GET",
				},
			);
			const activeOrganization = useAuthQuery<
				Prettify<
					InferOrganization<OrgT> & {
						members: InferMember<OrgT>[];
						invitations: InferInvitation<OrgT>[];
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

			const activeMember = useAuthQuery<InferMember<OrgT>>(
				[$activeOrgSignal, $activeMemberSignal],
				"/organization/get-active-member",
				$fetch,
				{
					method: "GET",
				},
			);

			const activeMemberRole = useAuthQuery<{ role: string }>(
				[$activeOrgSignal, $activeMemberRoleSignal],
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
					return (
						path.startsWith("/organization/set-active") ||
						path === "/organization/create" ||
						path === "/organization/delete" ||
						path === "/organization/remove-member" ||
						path === "/organization/leave" ||
						path === "/organization/accept-invitation"
					);
				},
				signal: "$sessionSignal",
			},
		],
		$ERROR_CODES: ORGANIZATION_ERROR_CODES,
	} satisfies BetterAuthClientPlugin;
};

/**
 * Using the same `hasPermissionFn` function, but without the need for a `ctx` parameter or the `organizationId` parameter.
 */
export const clientSideHasPermission = (input: HasPermissionBaseInput) => {
	const acRoles: {
		[x: string]: Role<any> | undefined;
	} = input.options.roles || defaultRoles;

	return hasPermissionFn(input, acRoles);
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
		[K in keyof T]: T[K] extends { additionalFields: infer _AF }
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
