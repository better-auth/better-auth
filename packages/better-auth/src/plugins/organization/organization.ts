import type { AuthContext, BetterAuthPlugin } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import type { BetterAuthPluginDBSchema } from "@better-auth/core/db";
import { APIError } from "better-call";
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
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.NO_ACTIVE_ORGANIZATION,
				});
			}
			const adapter = getOrgAdapter<O>(ctx.context, options);
			const member = await adapter.findMemberByOrgId({
				userId: ctx.context.session.user.id,
				organizationId: activeOrganizationId,
			});
			if (!member) {
				throw new APIError("UNAUTHORIZED", {
					message:
						ORGANIZATION_ERROR_CODES.USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION,
				});
			}
			const result = await hasPermission(
				{
					role: member.role,
					options: options || {},
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
	options: O;
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
	options: O;
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
	options: O;
};
export function organization<
	O extends OrganizationOptions & {
		dynamicAccessControl: { enabled: true };
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
	options: O;
};
export function organization<O extends OrganizationOptions>(
	options?: O | undefined,
): {
	id: "organization";
	endpoints: OrganizationEndpoints<O>;
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
	options: O;
};
export function organization<O extends OrganizationOptions>(
	options?: O | undefined,
): any {
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
		createOrganization: createOrganization(options as O),
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
		updateOrganization: updateOrganization(options as O),
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
		deleteOrganization: deleteOrganization(options as O),
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
		setActiveOrganization: setActiveOrganization(options as O),
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
		getFullOrganization: getFullOrganization(options as O),
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
		listOrganizations: listOrganizations(options as O),
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
		createInvitation: createInvitation(options as O),
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
		cancelInvitation: cancelInvitation(options as O),
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
		acceptInvitation: acceptInvitation(options as O),
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
		getInvitation: getInvitation(options as O),
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
		rejectInvitation: rejectInvitation(options as O),
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
		listInvitations: listInvitations(options as O),
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
		getActiveMember: getActiveMember(options as O),
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
		checkOrganizationSlug: checkOrganizationSlug(options as O),
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

		addMember: addMember<O>(options as O),
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
		removeMember: removeMember(options as O),
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
		updateMemberRole: updateMemberRole(options as O),
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
		leaveOrganization: leaveOrganization(options as O),
		listUserInvitations: listUserInvitations(options as O),
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
		listMembers: listMembers(options as O),
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
		getActiveMemberRole: getActiveMemberRole(options as O),
	};
	const teamSupport = options?.teams?.enabled;
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
		createTeam: createTeam(options as O),
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
		listOrganizationTeams: listOrganizationTeams(options as O),
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
		removeTeam: removeTeam(options as O),
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
		updateTeam: updateTeam(options as O),
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
		setActiveTeam: setActiveTeam(options as O),
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
		listUserTeams: listUserTeams(options as O),
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
		listTeamMembers: listTeamMembers(options as O),
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
		addTeamMember: addTeamMember(options as O),
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
		removeTeamMember: removeTeamMember(options as O),
	};
	if (teamSupport) {
		endpoints = {
			...endpoints,
			...teamEndpoints,
		};
	}

	const dynamicAccessControlEndpoints = {
		createOrgRole: createOrgRole(options as O),
		deleteOrgRole: deleteOrgRole(options as O),
		listOrgRoles: listOrgRoles(options as O),
		getOrgRole: getOrgRole(options as O),
		updateOrgRole: updateOrgRole(options as O),
	};
	if (options?.dynamicAccessControl?.enabled) {
		endpoints = {
			...endpoints,
			...dynamicAccessControlEndpoints,
		};
	}
	const roles = {
		...defaultRoles,
		...options?.roles,
	};

	// Build team schema in a way that never introduces undefined values when spreading
	const teamSchema = teamSupport
		? ({
				team: {
					modelName: options?.schema?.team?.modelName,
					fields: {
						name: {
							type: "string",
							required: true,
							fieldName: options?.schema?.team?.fields?.name,
						},
						organizationId: {
							type: "string",
							required: true,
							references: {
								model: "organization",
								field: "id",
							},
							fieldName: options?.schema?.team?.fields?.organizationId,
							index: true,
						},
						createdAt: {
							type: "date",
							required: true,
							fieldName: options?.schema?.team?.fields?.createdAt,
						},
						updatedAt: {
							type: "date",
							required: false,
							fieldName: options?.schema?.team?.fields?.updatedAt,
							onUpdate: () => new Date(),
						},
						...(options?.schema?.team?.additionalFields || {}),
					},
				},
				teamMember: {
					modelName: options?.schema?.teamMember?.modelName,
					fields: {
						teamId: {
							type: "string",
							required: true,
							references: {
								model: "team",
								field: "id",
							},
							fieldName: options?.schema?.teamMember?.fields?.teamId,
							index: true,
						},
						userId: {
							type: "string",
							required: true,
							references: {
								model: "user",
								field: "id",
							},
							fieldName: options?.schema?.teamMember?.fields?.userId,
							index: true,
						},
						createdAt: {
							type: "date",
							required: false,
							fieldName: options?.schema?.teamMember?.fields?.createdAt,
						},
					},
				},
			} satisfies BetterAuthPluginDBSchema)
		: {};

	const organizationRoleSchema = options?.dynamicAccessControl?.enabled
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
							fieldName:
								options?.schema?.organizationRole?.fields?.organizationId,
							index: true,
						},
						role: {
							type: "string",
							required: true,
							fieldName: options?.schema?.organizationRole?.fields?.role,
							index: true,
						},
						permission: {
							type: "string",
							required: true,
							fieldName: options?.schema?.organizationRole?.fields?.permission,
						},
						createdAt: {
							type: "date",
							required: true,
							defaultValue: () => new Date(),
							fieldName: options?.schema?.organizationRole?.fields?.createdAt,
						},
						updatedAt: {
							type: "date",
							required: false,
							fieldName: options?.schema?.organizationRole?.fields?.updatedAt,
							onUpdate: () => new Date(),
						},
						...(options?.schema?.organizationRole?.additionalFields || {}),
					},
					modelName: options?.schema?.organizationRole?.modelName,
				},
			} satisfies BetterAuthPluginDBSchema)
		: {};

	const schema = {
		...({
			organization: {
				modelName: options?.schema?.organization?.modelName,
				fields: {
					name: {
						type: "string",
						required: true,
						sortable: true,
						fieldName: options?.schema?.organization?.fields?.name,
					},
					slug: {
						type: "string",
						required: true,
						unique: true,
						sortable: true,
						fieldName: options?.schema?.organization?.fields?.slug,
					},
					logo: {
						type: "string",
						required: false,
						fieldName: options?.schema?.organization?.fields?.logo,
					},
					createdAt: {
						type: "date",
						required: true,
						fieldName: options?.schema?.organization?.fields?.createdAt,
					},
					metadata: {
						type: "string",
						required: false,
						fieldName: options?.schema?.organization?.fields?.metadata,
					},
					...(options?.schema?.organization?.additionalFields || {}),
				},
			},
		} satisfies BetterAuthPluginDBSchema),
		...organizationRoleSchema,
		...teamSchema,
		...({
			member: {
				modelName: options?.schema?.member?.modelName,
				fields: {
					organizationId: {
						type: "string",
						required: true,
						references: {
							model: "organization",
							field: "id",
						},
						fieldName: options?.schema?.member?.fields?.organizationId,
						index: true,
					},
					userId: {
						type: "string",
						required: true,
						fieldName: options?.schema?.member?.fields?.userId,
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
						fieldName: options?.schema?.member?.fields?.role,
					},
					createdAt: {
						type: "date",
						required: true,
						fieldName: options?.schema?.member?.fields?.createdAt,
					},
					...(options?.schema?.member?.additionalFields || {}),
				},
			},
			invitation: {
				modelName: options?.schema?.invitation?.modelName,
				fields: {
					organizationId: {
						type: "string",
						required: true,
						references: {
							model: "organization",
							field: "id",
						},
						fieldName: options?.schema?.invitation?.fields?.organizationId,
						index: true,
					},
					email: {
						type: "string",
						required: true,
						sortable: true,
						fieldName: options?.schema?.invitation?.fields?.email,
						index: true,
					},
					role: {
						type: "string",
						required: false,
						sortable: true,
						fieldName: options?.schema?.invitation?.fields?.role,
					},
					...(teamSupport
						? {
								teamId: {
									type: "string",
									required: false,
									sortable: true,
									fieldName: options?.schema?.invitation?.fields?.teamId,
								},
							}
						: {}),
					status: {
						type: "string",
						required: true,
						sortable: true,
						defaultValue: "pending",
						fieldName: options?.schema?.invitation?.fields?.status,
					},
					expiresAt: {
						type: "date",
						required: true,
						fieldName: options?.schema?.invitation?.fields?.expiresAt,
					},
					createdAt: {
						type: "date",
						required: true,
						fieldName: options?.schema?.invitation?.fields?.createdAt,
						defaultValue: () => new Date(),
					},
					inviterId: {
						type: "string",
						references: {
							model: "user",
							field: "id",
						},
						fieldName: options?.schema?.invitation?.fields?.inviterId,
						required: true,
					},
					...(options?.schema?.invitation?.additionalFields || {}),
				},
			},
		} satisfies BetterAuthPluginDBSchema),
	};

	/**
	 * the orgMiddleware type-asserts an empty object representing org options, roles, and a getSession function.
	 * This `shimContext` function is used to add those missing properties to the context object.
	 */
	const api = shimContext(endpoints, {
		orgOptions: options || {},
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
			hasPermission: createHasPermission(options as O),
		},
		schema: {
			...(schema as BetterAuthPluginDBSchema),
			session: {
				fields: {
					activeOrganizationId: {
						type: "string",
						required: false,
						fieldName: options?.schema?.session?.fields?.activeOrganizationId,
					},
					...(teamSupport
						? {
								activeTeamId: {
									type: "string",
									required: false,
									fieldName: options?.schema?.session?.fields?.activeTeamId,
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
		options: options as O,
	} satisfies BetterAuthPlugin;
}
