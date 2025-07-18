import { APIError } from "better-call";
import * as z from "zod/v4";
import type { AuthPluginSchema } from "../../types";
import { createAuthEndpoint } from "../../api/call";
import { getSessionFromCtx } from "../../api/routes";
import type { AuthContext } from "../../init";
import type { BetterAuthPlugin } from "../../types/plugins";
import { shimContext } from "../../utils/shim";
import { type AccessControl } from "../access";
import { getOrgAdapter } from "./adapter";
import { orgSessionMiddleware } from "./call";
import {
	acceptInvitation,
	cancelInvitation,
	createInvitation,
	getInvitation,
	listInvitations,
	rejectInvitation,
	listUserInvitations,
} from "./routes/crud-invites";
import {
	addMember,
	getActiveMember,
	leaveOrganization,
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
	createTeam,
	listOrganizationTeams,
	removeTeam,
	updateTeam,
} from "./routes/crud-team";
import type {
	InferInvitation,
	InferMember,
	Organization,
	Team,
} from "./schema";
import { ORGANIZATION_ERROR_CODES } from "./error-codes";
import { defaultRoles, defaultStatements } from "./access";
import { hasPermission } from "./has-permission";
import type { OrganizationOptions } from "./types";

export function parseRoles(roles: string | string[]): string {
	return Array.isArray(roles) ? roles.join(",") : roles;
}

/**
 * Organization plugin for Better Auth. Organization allows you to create teams, members,
 * and manage access control for your users.
 *
 * @example
 * ```ts
 * const auth = betterAuth({
 * 	plugins: [
 * 		organization({
 * 			allowUserToCreateOrganization: true,
 * 		}),
 * 	],
 * });
 * ```
 */
export const organization = <O extends OrganizationOptions>(
	options?: OrganizationOptions & O,
) => {
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
		createOrganization: createOrganization,
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
		updateOrganization: updateOrganization,
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
		deleteOrganization: deleteOrganization,
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
		setActiveOrganization: setActiveOrganization<O>(),
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
		getFullOrganization: getFullOrganization<O>(),
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
		listOrganizations: listOrganizations,
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
		cancelInvitation: cancelInvitation,
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
		acceptInvitation: acceptInvitation,
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
		getInvitation: getInvitation,
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
		rejectInvitation: rejectInvitation,
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
		listInvitations: listInvitations,
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
		getActiveMember: getActiveMember,
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
		checkOrganizationSlug: checkOrganizationSlug,
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
		 * **client:**
		 * `authClient.organization.addMember`
		 *
		 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/organization#api-method-organization-add-member)
		 */

		addMember: addMember<O>(),
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
		removeMember: removeMember,
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
		leaveOrganization: leaveOrganization,
		listUserInvitations,
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
		listOrganizationTeams: listOrganizationTeams,
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
		removeTeam: removeTeam,
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
		updateTeam: updateTeam,
	};
	if (teamSupport) {
		endpoints = {
			...endpoints,
			...teamEndpoints,
		};
	}
	const roles = {
		...defaultRoles,
		...options?.roles,
	};

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
						},
					},
				},
			} satisfies AuthPluginSchema)
		: undefined;

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

	type DefaultStatements = typeof defaultStatements;
	type Statements = O["ac"] extends AccessControl<infer S>
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

	return {
		id: "organization",
		endpoints: {
			...(api as O["teams"] extends { enabled: true }
				? typeof teamEndpoints & typeof endpoints
				: typeof endpoints),
			hasPermission: createAuthEndpoint(
				"/organization/has-permission",
				{
					method: "POST",
					requireHeaders: true,
					body: z
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
						),
					use: [orgSessionMiddleware],
					metadata: {
						$Infer: {
							body: {} as PermissionExclusive & {
								organizationId?: string;
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
					const adapter = getOrgAdapter(ctx.context);
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
					const result = hasPermission({
						role: member.role,
						options: options || {},
						permissions: (ctx.body.permissions ?? ctx.body.permission) as any,
					});
					return ctx.json({
						error: null,
						success: result,
					});
				},
			),
		},
		schema: {
			session: {
				fields: {
					activeOrganizationId: {
						type: "string",
						required: false,
						fieldName: options?.schema?.session?.fields?.activeOrganizationId,
					},
				},
			},
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
				},
			},
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
					},
					userId: {
						type: "string",
						required: true,
						fieldName: options?.schema?.member?.fields?.userId,
						references: {
							model: "user",
							field: "id",
						},
					},
					role: {
						type: "string",
						required: true,
						sortable: true,
						defaultValue: "member",
						fieldName: options?.schema?.member?.fields?.role,
					},
					...(teamSupport
						? {
								teamId: {
									type: "string",
									required: false,
									sortable: true,
									fieldName: options?.schema?.member?.fields?.teamId,
								},
							}
						: {}),
					createdAt: {
						type: "date",
						required: true,
						fieldName: options?.schema?.member?.fields?.createdAt,
					},
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
					},
					email: {
						type: "string",
						required: true,
						sortable: true,
						fieldName: options?.schema?.invitation?.fields?.email,
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
					inviterId: {
						type: "string",
						references: {
							model: "user",
							field: "id",
						},
						fieldName: options?.schema?.invitation?.fields?.inviterId,
						required: true,
					},
				},
			},
			...(teamSupport ? teamSchema : {}),
		},
		$Infer: {
			Organization: {} as Organization,
			Invitation: {} as InferInvitation<O>,
			Member: {} as InferMember<O>,
			Team: teamSupport ? ({} as Team) : ({} as any),
			ActiveOrganization: {} as Awaited<
				ReturnType<ReturnType<typeof getFullOrganization<O>>>
			>,
		},
		$ERROR_CODES: ORGANIZATION_ERROR_CODES,
		options,
	} satisfies BetterAuthPlugin;
};
