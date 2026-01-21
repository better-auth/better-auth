import type { AuthContext, BetterAuthPlugin } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import type { BetterAuthPluginDBSchema } from "@better-auth/core/db";
import { APIError } from "@better-auth/core/error";
import * as z from "zod";
import { getSessionFromCtx } from "../../api";
import { shimContext } from "../../utils/shim";
import type { AccessControl } from "../access";
import type { defaultStatements } from "./access";
import { defaultRoles } from "./access";
import { getOrgAdapter } from "./adapter";
import { orgSessionMiddleware } from "./call";
import { ORGANIZATION_ERROR_CODES } from "./error-codes";
import { hasPermission } from "./has-permission";
import {
	createOrgRole,
	deleteOrgRole,
	getOrgRole,
	listOrgRoles,
	updateOrgRole,
} from "./routes/crud-access-control";
import {
	acceptInvitation,
	cancelInvitation,
	createInvitation,
	getInvitation,
	listInvitations,
	listUserInvitations,
	rejectInvitation,
} from "./routes/crud-invites";
import {
	addMember,
	getActiveMember,
	getActiveMemberRole,
	leaveOrganization,
	listMembers,
	removeMember,
	updateMemberRole,
} from "./routes/crud-members";
import {
	checkOrganizationSlug,
	createOrganization,
	deleteOrganization,
	getFullOrganization,
	listOrganizations,
	setActiveOrganization,
	updateOrganization,
} from "./routes/crud-org";
import {
	addTeamMember,
	createTeam,
	listOrganizationTeams,
	listTeamMembers,
	listUserTeams,
	removeTeam,
	removeTeamMember,
	setActiveTeam,
	updateTeam,
} from "./routes/crud-team";
import type {
	InferInvitation,
	InferMember,
	InferOrganization,
	InferTeam,
	OrganizationSchema,
	Team,
	TeamMember,
} from "./schema";
import type { OrganizationOptions } from "./types";

declare module "@better-auth/core" {
	// biome-ignore lint/correctness/noUnusedVariables: Auth and Context need to be same as declared in the module
	interface BetterAuthPluginRegistry<AuthOptions, Options> {
		organization: {
			creator: OrganizationCreator;
		};
	}
}

export type DefaultOrganizationPlugin<Options extends OrganizationOptions> = {
	id: "organization";
	endpoints: OrganizationEndpoints<Options>;
	schema: OrganizationSchema<Options>;
	$Infer: {
		Organization: InferOrganization<Options>;
		Invitation: InferInvitation<Options>;
		Member: InferMember<Options>;
		Team: Options["teams"] extends { enabled: true } ? Team : any;
		TeamMember: Options["teams"] extends { enabled: true } ? TeamMember : any;
		ActiveOrganization: Options["teams"] extends { enabled: true }
			? {
					members: InferMember<Options, false>[];
					invitations: InferInvitation<Options, false>[];
					teams: InferTeam<Options, false>[];
				} & InferOrganization<Options, false>
			: {
					members: InferMember<Options, false>[];
					invitations: InferInvitation<Options, false>[];
				} & InferOrganization<Options, false>;
	};
	$ERROR_CODES: typeof ORGANIZATION_ERROR_CODES;
	options: NoInfer<Options>;
};

export interface OrganizationCreator {
	<Options extends OrganizationOptions>(
		options?: Options | undefined,
	): DefaultOrganizationPlugin<Options>;
}

export function parseRoles(roles: string | string[]): string {
	return Array.isArray(roles) ? roles.join(",") : roles;
}

export type DynamicAccessControlEndpoints<O extends OrganizationOptions> = {
	createOrgRole: ReturnType<typeof createOrgRole<O>>;
	deleteOrgRole: ReturnType<typeof deleteOrgRole<O>>;
	listOrgRoles: ReturnType<typeof listOrgRoles<O>>;
	getOrgRole: ReturnType<typeof getOrgRole<O>>;
	updateOrgRole: ReturnType<typeof updateOrgRole<O>>;
};

export type TeamEndpoints<O extends OrganizationOptions> = {
	createTeam: ReturnType<typeof createTeam<O>>;
	listOrganizationTeams: ReturnType<typeof listOrganizationTeams<O>>;
	removeTeam: ReturnType<typeof removeTeam<O>>;
	updateTeam: ReturnType<typeof updateTeam<O>>;
	setActiveTeam: ReturnType<typeof setActiveTeam<O>>;
	listUserTeams: ReturnType<typeof listUserTeams<O>>;
	listTeamMembers: ReturnType<typeof listTeamMembers<O>>;
	addTeamMember: ReturnType<typeof addTeamMember<O>>;
	removeTeamMember: ReturnType<typeof removeTeamMember<O>>;
};

export type OrganizationEndpoints<O extends OrganizationOptions> = {
	createOrganization: ReturnType<typeof createOrganization<O>>;
	updateOrganization: ReturnType<typeof updateOrganization<O>>;
	deleteOrganization: ReturnType<typeof deleteOrganization<O>>;
	setActiveOrganization: ReturnType<typeof setActiveOrganization<O>>;
	getFullOrganization: ReturnType<typeof getFullOrganization<O>>;
	listOrganizations: ReturnType<typeof listOrganizations<O>>;
	createInvitation: ReturnType<typeof createInvitation<O>>;
	cancelInvitation: ReturnType<typeof cancelInvitation<O>>;
	acceptInvitation: ReturnType<typeof acceptInvitation<O>>;
	getInvitation: ReturnType<typeof getInvitation<O>>;
	rejectInvitation: ReturnType<typeof rejectInvitation<O>>;
	listInvitations: ReturnType<typeof listInvitations<O>>;
	getActiveMember: ReturnType<typeof getActiveMember<O>>;
	checkOrganizationSlug: ReturnType<typeof checkOrganizationSlug<O>>;
	addMember: ReturnType<typeof addMember<O>>;
	removeMember: ReturnType<typeof removeMember<O>>;
	updateMemberRole: ReturnType<typeof updateMemberRole<O>>;
	leaveOrganization: ReturnType<typeof leaveOrganization<O>>;
	listUserInvitations: ReturnType<typeof listUserInvitations<O>>;
	listMembers: ReturnType<typeof listMembers<O>>;
	getActiveMemberRole: ReturnType<typeof getActiveMemberRole<O>>;
	hasPermission: ReturnType<typeof createHasPermission<O>>;
};

const createHasPermissionBodySchema = z
	.object({
		organizationId: z.string().optional(),
	})
	.and(
		z.union([
			z.object({
				permission: z.record(z.string(), z.array(z.string())),
				permissions: z.undefined(),
			}),
			z.object({
				permission: z.undefined(),
				permissions: z.record(z.string(), z.array(z.string())),
			}),
		]),
	);

const createHasPermission = <O extends OrganizationOptions>(options: O) => {
	type DefaultStatements = typeof defaultStatements;
	type Statements =
		O["ac"] extends AccessControl<infer S> ? S : DefaultStatements;
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

	return createAuthEndpoint(
		"/organization/has-permission",
		{
			method: "POST",
			requireHeaders: true,
			body: createHasPermissionBodySchema,
			use: [orgSessionMiddleware],
			metadata: {
				$Infer: {
					body: {} as PermissionExclusive & {
						organizationId?: string | undefined;
					},
				},
				openapi: {
					description: "Check if the user has permission",
					requestBody: {
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										permission: {
											type: "object",
											description: "The permission to check",
											deprecated: true,
										},
										permissions: {
											type: "object",
											description: "The permission to check",
										},
									},
									required: ["permissions"],
								},
							},
						},
					},
					responses: {
						"200": {
							description: "Success",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											error: {
												type: "string",
											},
											success: {
												type: "boolean",
											},
										},
										required: ["success"],
									},
								},
							},
						},
					},
				},
			},
		},
		async (ctx) => {
			const activeOrganizationId =
				ctx.body.organizationId ||
				ctx.context.session.session.activeOrganizationId;
			if (!activeOrganizationId) {
				throw APIError.from(
					"BAD_REQUEST",
					ORGANIZATION_ERROR_CODES.NO_ACTIVE_ORGANIZATION,
				);
			}
			const adapter = getOrgAdapter<O>(ctx.context, options);
			const member = await adapter.findMemberByOrgId({
				userId: ctx.context.session.user.id,
				organizationId: activeOrganizationId,
			});
			if (!member) {
				throw APIError.from(
					"UNAUTHORIZED",
					ORGANIZATION_ERROR_CODES.USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION,
				);
			}
			const result = await hasPermission(
				{
					role: member.role,
					options: options,
					permissions: (ctx.body.permissions ?? ctx.body.permission) as any,
					organizationId: activeOrganizationId,
				},
				ctx,
			);

			return ctx.json({
				error: null,
				success: result,
			});
		},
	);
};

export type OrganizationPlugin<O extends OrganizationOptions> = {
	id: "organization";
	endpoints: OrganizationEndpoints<O> &
		(O extends { teams: { enabled: true } } ? TeamEndpoints<O> : {}) &
		(O extends { dynamicAccessControl: { enabled: true } }
			? DynamicAccessControlEndpoints<O>
			: {});
	schema: OrganizationSchema<O>;
	$Infer: {
		Organization: InferOrganization<O>;
		Invitation: InferInvitation<O>;
		Member: InferMember<O>;
		Team: O["teams"] extends { enabled: true } ? Team : any;
		TeamMember: O["teams"] extends { enabled: true } ? TeamMember : any;
		ActiveOrganization: O["teams"] extends { enabled: true }
			? {
					members: InferMember<O, false>[];
					invitations: InferInvitation<O, false>[];
					teams: InferTeam<O, false>[];
				} & InferOrganization<O, false>
			: {
					members: InferMember<O, false>[];
					invitations: InferInvitation<O, false>[];
				} & InferOrganization<O, false>;
	};
	$ERROR_CODES: typeof ORGANIZATION_ERROR_CODES;
	options: NoInfer<O>;
};

/**
 * Organization plugin for Better Auth. Organization allows you to create teams, members,
 * and manage access control for your users.
 *
 * @example
 * ```ts
 * const auth = betterAuth({
 *  plugins: [
 *    organization({
 *      allowUserToCreateOrganization: true,
 *    }),
 *  ],
 * });
 * ```
 */
export function organization<
	O extends OrganizationOptions & {
		teams: { enabled: true };
		dynamicAccessControl?:
			| {
					enabled?: false | undefined;
			  }
			| undefined;
	},
>(
	options?: O | undefined,
): {
	id: "organization";
	endpoints: OrganizationEndpoints<O> & TeamEndpoints<O>;
	schema: OrganizationSchema<O>;
	$Infer: {
		Organization: InferOrganization<O>;
		Invitation: InferInvitation<O>;
		Member: InferMember<O>;
		Team: O["teams"] extends { enabled: true } ? Team : unknown;
		TeamMember: O["teams"] extends { enabled: true } ? TeamMember : unknown;
		ActiveOrganization: O["teams"] extends { enabled: true }
			? {
					members: InferMember<O, false>[];
					invitations: InferInvitation<O, false>[];
					teams: InferTeam<O, false>[];
				} & InferOrganization<O, false>
			: {
					members: InferMember<O, false>[];
					invitations: InferInvitation<O, false>[];
				} & InferOrganization<O, false>;
	};
	$ERROR_CODES: typeof ORGANIZATION_ERROR_CODES;
	options: NoInfer<O>;
};
export function organization<
	O extends OrganizationOptions & {
		teams: { enabled: true };
		dynamicAccessControl: { enabled: true };
	},
>(
	options?: O | undefined,
): {
	id: "organization";
	endpoints: OrganizationEndpoints<O> &
		TeamEndpoints<O> &
		DynamicAccessControlEndpoints<O>;
	schema: OrganizationSchema<O>;
	$Infer: {
		Organization: InferOrganization<O>;
		Invitation: InferInvitation<O>;
		Member: InferMember<O>;
		Team: O["teams"] extends { enabled: true } ? Team : any;
		TeamMember: O["teams"] extends { enabled: true } ? TeamMember : any;
		ActiveOrganization: O["teams"] extends { enabled: true }
			? {
					members: InferMember<O, false>[];
					invitations: InferInvitation<O, false>[];
					teams: InferTeam<O, false>[];
				} & InferOrganization<O, false>
			: {
					members: InferMember<O, false>[];
					invitations: InferInvitation<O, false>[];
				} & InferOrganization<O, false>;
	};
	$ERROR_CODES: typeof ORGANIZATION_ERROR_CODES;
	options: NoInfer<O>;
};
export function organization<
	O extends OrganizationOptions & {
		dynamicAccessControl: { enabled: true };
		teams?: { enabled?: false | undefined } | undefined;
	},
>(
	options?: O | undefined,
): {
	id: "organization";
	endpoints: OrganizationEndpoints<O> & DynamicAccessControlEndpoints<O>;
	schema: OrganizationSchema<O>;
	$Infer: {
		Organization: InferOrganization<O>;
		Invitation: InferInvitation<O>;
		Member: InferMember<O>;
		Team: O["teams"] extends { enabled: true } ? Team : any;
		TeamMember: O["teams"] extends { enabled: true } ? TeamMember : any;
		ActiveOrganization: O["teams"] extends { enabled: true }
			? {
					members: InferMember<O, false>[];
					invitations: InferInvitation<O, false>[];
					teams: InferTeam<O, false>[];
				} & InferOrganization<O, false>
			: {
					members: InferMember<O, false>[];
					invitations: InferInvitation<O, false>[];
				} & InferOrganization<O, false>;
	};
	$ERROR_CODES: typeof ORGANIZATION_ERROR_CODES;
	options: NoInfer<O>;
};
export function organization<O extends OrganizationOptions>(
	options?: O | undefined,
): DefaultOrganizationPlugin<O>;
export function organization<O extends OrganizationOptions>(options?: O) {
	const opts = (options || {}) as O;
	let endpoints = {
		/**
		 * ### Endpoint
		 *
		 * POST `/organization/create`
		 *
		 * ### API Methods
		 *
		 * **server:**
		 * `auth.api.createOrganization`
		 *
		 * **client:**
		 * `authClient.organization.create`
		 *
		 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/organization#api-method-organization-create)
		 */
		createOrganization: createOrganization(opts),
		/**
		 * ### Endpoint
		 *
		 * POST `/organization/update`
		 *
		 * ### API Methods
		 *
		 * **server:**
		 * `auth.api.updateOrganization`
		 *
		 * **client:**
		 * `authClient.organization.update`
		 *
		 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/organization#api-method-organization-update)
		 */
		updateOrganization: updateOrganization(opts),
		/**
		 * ### Endpoint
		 *
		 * POST `/organization/delete`
		 *
		 * ### API Methods
		 *
		 * **server:**
		 * `auth.api.deleteOrganization`
		 *
		 * **client:**
		 * `authClient.organization.delete`
		 *
		 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/organization#api-method-organization-delete)
		 */
		deleteOrganization: deleteOrganization(opts),
		/**
		 * ### Endpoint
		 *
		 * POST `/organization/set-active`
		 *
		 * ### API Methods
		 *
		 * **server:**
		 * `auth.api.setActiveOrganization`
		 *
		 * **client:**
		 * `authClient.organization.setActive`
		 *
		 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/organization#api-method-organization-set-active)
		 */
		setActiveOrganization: setActiveOrganization(opts),
		/**
		 * ### Endpoint
		 *
		 * GET `/organization/get-full-organization`
		 *
		 * ### API Methods
		 *
		 * **server:**
		 * `auth.api.getFullOrganization`
		 *
		 * **client:**
		 * `authClient.organization.getFullOrganization`
		 *
		 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/organization#api-method-organization-get-full-organization)
		 */
		getFullOrganization: getFullOrganization(opts),
		/**
		 * ### Endpoint
		 *
		 * GET `/organization/list`
		 *
		 * ### API Methods
		 *
		 * **server:**
		 * `auth.api.listOrganizations`
		 *
		 * **client:**
		 * `authClient.organization.list`
		 *
		 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/organization#api-method-organization-list)
		 */
		listOrganizations: listOrganizations(opts),
		/**
		 * ### Endpoint
		 *
		 * POST `/organization/invite-member`
		 *
		 * ### API Methods
		 *
		 * **server:**
		 * `auth.api.createInvitation`
		 *
		 * **client:**
		 * `authClient.organization.inviteMember`
		 *
		 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/organization#api-method-organization-invite-member)
		 */
		createInvitation: createInvitation(opts),
		/**
		 * ### Endpoint
		 *
		 * POST `/organization/cancel-invitation`
		 *
		 * ### API Methods
		 *
		 * **server:**
		 * `auth.api.cancelInvitation`
		 *
		 * **client:**
		 * `authClient.organization.cancelInvitation`
		 *
		 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/organization#api-method-organization-cancel-invitation)
		 */
		cancelInvitation: cancelInvitation(opts),
		/**
		 * ### Endpoint
		 *
		 * POST `/organization/accept-invitation`
		 *
		 * ### API Methods
		 *
		 * **server:**
		 * `auth.api.acceptInvitation`
		 *
		 * **client:**
		 * `authClient.organization.acceptInvitation`
		 *
		 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/organization#api-method-organization-accept-invitation)
		 */
		acceptInvitation: acceptInvitation(opts),
		/**
		 * ### Endpoint
		 *
		 * GET `/organization/get-invitation`
		 *
		 * ### API Methods
		 *
		 * **server:**
		 * `auth.api.getInvitation`
		 *
		 * **client:**
		 * `authClient.organization.getInvitation`
		 *
		 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/organization#api-method-organization-get-invitation)
		 */
		getInvitation: getInvitation(opts),
		/**
		 * ### Endpoint
		 *
		 * POST `/organization/reject-invitation`
		 *
		 * ### API Methods
		 *
		 * **server:**
		 * `auth.api.rejectInvitation`
		 *
		 * **client:**
		 * `authClient.organization.rejectInvitation`
		 *
		 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/organization#api-method-organization-reject-invitation)
		 */
		rejectInvitation: rejectInvitation(opts),
		/**
		 * ### Endpoint
		 *
		 * GET `/organization/list-invitations`
		 *
		 * ### API Methods
		 *
		 * **server:**
		 * `auth.api.listInvitations`
		 *
		 * **client:**
		 * `authClient.organization.listInvitations`
		 *
		 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/organization#api-method-organization-list-invitations)
		 */
		listInvitations: listInvitations(opts),
		/**
		 * ### Endpoint
		 *
		 * GET `/organization/get-active-member`
		 *
		 * ### API Methods
		 *
		 * **server:**
		 * `auth.api.getActiveMember`
		 *
		 * **client:**
		 * `authClient.organization.getActiveMember`
		 *
		 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/organization#api-method-organization-get-active-member)
		 */
		getActiveMember: getActiveMember(opts),
		/**
		 * ### Endpoint
		 *
		 * POST `/organization/check-slug`
		 *
		 * ### API Methods
		 *
		 * **server:**
		 * `auth.api.checkOrganizationSlug`
		 *
		 * **client:**
		 * `authClient.organization.checkSlug`
		 *
		 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/organization#api-method-organization-check-slug)
		 */
		checkOrganizationSlug: checkOrganizationSlug(opts),
		/**
		 * ### Endpoint
		 *
		 * POST `/organization/add-member`
		 *
		 * ### API Methods
		 *
		 * **server:**
		 * `auth.api.addMember`
		 *
		 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/organization#api-method-organization-add-member)
		 */

		addMember: addMember<O>(opts),
		/**
		 * ### Endpoint
		 *
		 * POST `/organization/remove-member`
		 *
		 * ### API Methods
		 *
		 * **server:**
		 * `auth.api.removeMember`
		 *
		 * **client:**
		 * `authClient.organization.removeMember`
		 *
		 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/organization#api-method-organization-remove-member)
		 */
		removeMember: removeMember(opts),
		/**
		 * ### Endpoint
		 *
		 * POST `/organization/update-member-role`
		 *
		 * ### API Methods
		 *
		 * **server:**
		 * `auth.api.updateMemberRole`
		 *
		 * **client:**
		 * `authClient.organization.updateMemberRole`
		 *
		 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/organization#api-method-organization-update-member-role)
		 */
		updateMemberRole: updateMemberRole(opts),
		/**
		 * ### Endpoint
		 *
		 * POST `/organization/leave`
		 *
		 * ### API Methods
		 *
		 * **server:**
		 * `auth.api.leaveOrganization`
		 *
		 * **client:**
		 * `authClient.organization.leave`
		 *
		 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/organization#api-method-organization-leave)
		 */
		leaveOrganization: leaveOrganization(opts),
		listUserInvitations: listUserInvitations(opts),
		/**
		 * ### Endpoint
		 *
		 * GET `/organization/list-members`
		 *
		 * ### API Methods
		 *
		 * **server:**
		 * `auth.api.listMembers`
		 *
		 * **client:**
		 * `authClient.organization.listMembers`
		 */
		listMembers: listMembers(opts),
		/**
		 * ### Endpoint
		 *
		 * GET `/organization/get-active-member-role`
		 *
		 * ### API Methods
		 *
		 * **server:**
		 * `auth.api.getActiveMemberRole`
		 *
		 * **client:**
		 * `authClient.organization.getActiveMemberRole`
		 *
		 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/organization#api-method-organization-get-active-member-role)
		 */
		getActiveMemberRole: getActiveMemberRole(opts),
	};
	const teamSupport = opts.teams?.enabled;
	const teamEndpoints = {
		/**
		 * ### Endpoint
		 *
		 * POST `/organization/create-team`
		 *
		 * ### API Methods
		 *
		 * **server:**
		 * `auth.api.createTeam`
		 *
		 * **client:**
		 * `authClient.organization.createTeam`
		 *
		 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/organization#api-method-organization-create-team)
		 */
		createTeam: createTeam(opts),
		/**
		 * ### Endpoint
		 *
		 * GET `/organization/list-teams`
		 *
		 * ### API Methods
		 *
		 * **server:**
		 * `auth.api.listOrganizationTeams`
		 *
		 * **client:**
		 * `authClient.organization.listTeams`
		 *
		 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/organization#api-method-organization-list-teams)
		 */
		listOrganizationTeams: listOrganizationTeams(opts),
		/**
		 * ### Endpoint
		 *
		 * POST `/organization/remove-team`
		 *
		 * ### API Methods
		 *
		 * **server:**
		 * `auth.api.removeTeam`
		 *
		 * **client:**
		 * `authClient.organization.removeTeam`
		 *
		 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/organization#api-method-organization-remove-team)
		 */
		removeTeam: removeTeam(opts),
		/**
		 * ### Endpoint
		 *
		 * POST `/organization/update-team`
		 *
		 * ### API Methods
		 *
		 * **server:**
		 * `auth.api.updateTeam`
		 *
		 * **client:**
		 * `authClient.organization.updateTeam`
		 *
		 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/organization#api-method-organization-update-team)
		 */
		updateTeam: updateTeam(opts),
		/**
		 * ### Endpoint
		 *
		 * POST `/organization/set-active-team`
		 *
		 * ### API Methods
		 *
		 * **server:**
		 * `auth.api.setActiveTeam`
		 *
		 * **client:**
		 * `authClient.organization.setActiveTeam`
		 *
		 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/organization#api-set-active-team)
		 */
		setActiveTeam: setActiveTeam(opts),
		/**
		 * ### Endpoint
		 *
		 * GET `/organization/list-user-teams`
		 *
		 * ### API Methods
		 *
		 * **server:**
		 * `auth.api.listUserTeams`
		 *
		 * **client:**
		 * `authClient.organization.listUserTeams`
		 *
		 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/organization#api-set-active-team)
		 */
		listUserTeams: listUserTeams(opts),
		/**
		 * ### Endpoint
		 *
		 * POST `/organization/list-team-members`
		 *
		 * ### API Methods
		 *
		 * **server:**
		 * `auth.api.listTeamMembers`
		 *
		 * **client:**
		 * `authClient.organization.listTeamMembers`
		 *
		 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/organization#api-set-active-team)
		 */
		listTeamMembers: listTeamMembers(opts),
		/**
		 * ### Endpoint
		 *
		 * POST `/organization/add-team-member`
		 *
		 * ### API Methods
		 *
		 * **server:**
		 * `auth.api.addTeamMember`
		 *
		 * **client:**
		 * `authClient.organization.addTeamMember`
		 *
		 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/organization#api-add-team-member)
		 */
		addTeamMember: addTeamMember(opts),
		/**
		 * ### Endpoint
		 *
		 * POST `/organization/remove-team-member`
		 *
		 * ### API Methods
		 *
		 * **server:**
		 * `auth.api.removeTeamMember`
		 *
		 * **client:**
		 * `authClient.organization.removeTeamMember`
		 *
		 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/organization#api-remove-team-member)
		 */
		removeTeamMember: removeTeamMember(opts),
	};
	if (teamSupport) {
		endpoints = {
			...endpoints,
			...teamEndpoints,
		};
	}

	const dynamicAccessControlEndpoints = {
		createOrgRole: createOrgRole(opts),
		deleteOrgRole: deleteOrgRole(opts),
		listOrgRoles: listOrgRoles(opts),
		getOrgRole: getOrgRole(opts),
		updateOrgRole: updateOrgRole(opts),
	};
	if (opts.dynamicAccessControl?.enabled) {
		endpoints = {
			...endpoints,
			...dynamicAccessControlEndpoints,
		};
	}
	const roles = {
		...defaultRoles,
		...opts.roles,
	};

	// Build team schema in a way that never introduces undefined values when spreading
	const teamSchema = teamSupport
		? ({
				team: {
					modelName: opts.schema?.team?.modelName,
					fields: {
						name: {
							type: "string",
							required: true,
							fieldName: opts.schema?.team?.fields?.name,
						},
						organizationId: {
							type: "string",
							required: true,
							references: {
								model: "organization",
								field: "id",
							},
							fieldName: opts.schema?.team?.fields?.organizationId,
							index: true,
						},
						createdAt: {
							type: "date",
							required: true,
							fieldName: opts.schema?.team?.fields?.createdAt,
						},
						updatedAt: {
							type: "date",
							required: false,
							fieldName: opts.schema?.team?.fields?.updatedAt,
							onUpdate: () => new Date(),
						},
						...(opts.schema?.team?.additionalFields || {}),
					},
				},
				teamMember: {
					modelName: opts.schema?.teamMember?.modelName,
					fields: {
						teamId: {
							type: "string",
							required: true,
							references: {
								model: "team",
								field: "id",
							},
							fieldName: opts.schema?.teamMember?.fields?.teamId,
							index: true,
						},
						userId: {
							type: "string",
							required: true,
							references: {
								model: "user",
								field: "id",
							},
							fieldName: opts.schema?.teamMember?.fields?.userId,
							index: true,
						},
						createdAt: {
							type: "date",
							required: false,
							fieldName: opts.schema?.teamMember?.fields?.createdAt,
						},
					},
				},
			} satisfies BetterAuthPluginDBSchema)
		: {};

	const organizationRoleSchema = opts.dynamicAccessControl?.enabled
		? ({
				organizationRole: {
					fields: {
						organizationId: {
							type: "string",
							required: true,
							references: {
								model: "organization",
								field: "id",
							},
							fieldName: opts.schema?.organizationRole?.fields?.organizationId,
							index: true,
						},
						role: {
							type: "string",
							required: true,
							fieldName: opts.schema?.organizationRole?.fields?.role,
							index: true,
						},
						permission: {
							type: "string",
							required: true,
							fieldName: opts.schema?.organizationRole?.fields?.permission,
						},
						createdAt: {
							type: "date",
							required: true,
							defaultValue: () => new Date(),
							fieldName: opts.schema?.organizationRole?.fields?.createdAt,
						},
						updatedAt: {
							type: "date",
							required: false,
							fieldName: opts.schema?.organizationRole?.fields?.updatedAt,
							onUpdate: () => new Date(),
						},
						...(opts.schema?.organizationRole?.additionalFields || {}),
					},
					modelName: opts.schema?.organizationRole?.modelName,
				},
			} satisfies BetterAuthPluginDBSchema)
		: {};

	const schema = {
		...({
			organization: {
				modelName: opts.schema?.organization?.modelName,
				fields: {
					name: {
						type: "string",
						required: true,
						sortable: true,
						fieldName: opts.schema?.organization?.fields?.name,
					},
					slug: {
						type: "string",
						required: true,
						unique: true,
						sortable: true,
						fieldName: opts.schema?.organization?.fields?.slug,
						index: true,
					},
					logo: {
						type: "string",
						required: false,
						fieldName: opts.schema?.organization?.fields?.logo,
					},
					createdAt: {
						type: "date",
						required: true,
						fieldName: opts.schema?.organization?.fields?.createdAt,
					},
					metadata: {
						type: "string",
						required: false,
						fieldName: opts.schema?.organization?.fields?.metadata,
					},
					...(opts.schema?.organization?.additionalFields || {}),
				},
			},
		} satisfies BetterAuthPluginDBSchema),
		...organizationRoleSchema,
		...teamSchema,
		...({
			member: {
				modelName: opts.schema?.member?.modelName,
				fields: {
					organizationId: {
						type: "string",
						required: true,
						references: {
							model: "organization",
							field: "id",
						},
						fieldName: opts.schema?.member?.fields?.organizationId,
						index: true,
					},
					userId: {
						type: "string",
						required: true,
						fieldName: opts.schema?.member?.fields?.userId,
						references: {
							model: "user",
							field: "id",
						},
						index: true,
					},
					role: {
						type: "string",
						required: true,
						sortable: true,
						defaultValue: "member",
						fieldName: opts.schema?.member?.fields?.role,
					},
					createdAt: {
						type: "date",
						required: true,
						fieldName: opts.schema?.member?.fields?.createdAt,
					},
					...(opts.schema?.member?.additionalFields || {}),
				},
			},
			invitation: {
				modelName: opts.schema?.invitation?.modelName,
				fields: {
					organizationId: {
						type: "string",
						required: true,
						references: {
							model: "organization",
							field: "id",
						},
						fieldName: opts.schema?.invitation?.fields?.organizationId,
						index: true,
					},
					email: {
						type: "string",
						required: true,
						sortable: true,
						fieldName: opts.schema?.invitation?.fields?.email,
						index: true,
					},
					role: {
						type: "string",
						required: false,
						sortable: true,
						fieldName: opts.schema?.invitation?.fields?.role,
					},
					...(teamSupport
						? {
								teamId: {
									type: "string",
									required: false,
									sortable: true,
									fieldName: opts.schema?.invitation?.fields?.teamId,
								},
							}
						: {}),
					status: {
						type: "string",
						required: true,
						sortable: true,
						defaultValue: "pending",
						fieldName: opts.schema?.invitation?.fields?.status,
					},
					expiresAt: {
						type: "date",
						required: true,
						fieldName: opts.schema?.invitation?.fields?.expiresAt,
					},
					createdAt: {
						type: "date",
						required: true,
						fieldName: opts.schema?.invitation?.fields?.createdAt,
						defaultValue: () => new Date(),
					},
					inviterId: {
						type: "string",
						references: {
							model: "user",
							field: "id",
						},
						fieldName: opts.schema?.invitation?.fields?.inviterId,
						required: true,
					},
					...(opts.schema?.invitation?.additionalFields || {}),
				},
			},
		} satisfies BetterAuthPluginDBSchema),
	};

	/**
	 * the orgMiddleware type-asserts an empty object representing org options, roles, and a getSession function.
	 * This `shimContext` function is used to add those missing properties to the context object.
	 */
	const api = shimContext(endpoints, {
		orgOptions: opts,
		roles,
		getSession: async (context: AuthContext) => {
			//@ts-expect-error
			return await getSessionFromCtx(context);
		},
	});

	return {
		id: "organization",
		endpoints: {
			...(api as OrganizationEndpoints<O>),
			hasPermission: createHasPermission(opts),
		},
		schema: {
			...(schema as BetterAuthPluginDBSchema),
			session: {
				fields: {
					activeOrganizationId: {
						type: "string",
						required: false,
						fieldName: opts.schema?.session?.fields?.activeOrganizationId,
					},
					...(teamSupport
						? {
								activeTeamId: {
									type: "string",
									required: false,
									fieldName: opts.schema?.session?.fields?.activeTeamId,
								},
							}
						: {}),
				} as unknown as O["teams"] extends {
					enabled: true;
				}
					? {
							activeTeamId: {
								type: "string";
								required: false;
							};
							activeOrganizationId: {
								type: "string";
								required: false;
							};
						}
					: {
							activeOrganizationId: {
								type: "string";
								required: false;
							};
						},
			},
		},
		$Infer: {
			Organization: {} as InferOrganization<O>,
			Invitation: {} as InferInvitation<O>,
			Member: {} as InferMember<O>,
			Team: teamSupport ? ({} as Team) : ({} as any),
			TeamMember: teamSupport ? ({} as TeamMember) : ({} as any),
			ActiveOrganization: {} as O["teams"] extends { enabled: true }
				? {
						members: InferMember<O, false>[];
						invitations: InferInvitation<O, false>[];
						teams: InferTeam<O, false>[];
					} & InferOrganization<O, false>
				: {
						members: InferMember<O, false>[];
						invitations: InferInvitation<O, false>[];
					} & InferOrganization<O, false>,
		},
		$ERROR_CODES: ORGANIZATION_ERROR_CODES,
		options: opts as NoInfer<O>,
	} satisfies BetterAuthPlugin;
}
