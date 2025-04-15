import { APIError } from "better-call";
import { z } from "zod";
import type { AuthPluginSchema, Session, User } from "../../types";
import { createAuthEndpoint } from "../../api/call";
import { getSessionFromCtx } from "../../api/routes";
import type { AuthContext } from "../../init";
import type { BetterAuthPlugin } from "../../types/plugins";
import { shimContext } from "../../utils/shim";
import { type AccessControl, type Role } from "../access";
import { getOrgAdapter } from "./adapter";
import { orgSessionMiddleware } from "./call";
import {
	acceptInvitation,
	cancelInvitation,
	createInvitation,
	getInvitation,
	listInvitations,
	rejectInvitation,
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
	Invitation,
	Member,
	Organization,
	Team,
} from "./schema";
import { ORGANIZATION_ERROR_CODES } from "./error-codes";
import { defaultRoles, defaultStatements } from "./access";
import { hasPermission } from "./has-permission";

export function parseRoles(roles: string | string[]): string {
	return Array.isArray(roles) ? roles.join(",") : roles;
}

export interface OrganizationOptions {
	/**
	 * Configure whether new users are able to create new organizations.
	 * You can also pass a function that returns a boolean.
	 *
	 * 	@example
	 * ```ts
	 * allowUserToCreateOrganization: async (user) => {
	 * 		const plan = await getUserPlan(user);
	 *      return plan.name === "pro";
	 * }
	 * ```
	 * @default true
	 */
	allowUserToCreateOrganization?:
		| boolean
		| ((user: User) => Promise<boolean> | boolean);
	/**
	 * The maximum number of organizations a user can create.
	 *
	 * You can also pass a function that returns a boolean
	 */
	organizationLimit?: number | ((user: User) => Promise<boolean> | boolean);
	/**
	 * The role that is assigned to the creator of the
	 * organization.
	 *
	 * @default "owner"
	 */
	creatorRole?: string;
	/**
	 * The number of memberships a user can have in an organization.
	 *
	 * @default 100
	 */
	membershipLimit?: number;
	/**
	 * Configure the roles and permissions for the
	 * organization plugin.
	 */
	ac?: AccessControl;
	/**
	 * Custom permissions for roles.
	 */
	roles?: {
		[key in string]?: Role<any>;
	};
	/**
	 * Support for team.
	 */
	teams?: {
		/**
		 * Enable team features.
		 */
		enabled: boolean;
		/**
		 * Default team configuration
		 */
		defaultTeam?: {
			/**
			 * Enable creating a default team when an organization is created
			 *
			 * @default true
			 */
			enabled: boolean;
			/**
			 * Pass a custom default team creator function
			 */
			customCreateDefaultTeam?: (
				organization: Organization & Record<string, any>,
				request?: Request,
			) => Promise<Team & Record<string, any>>;
		};
		/**
		 * Maximum number of teams an organization can have.
		 *
		 * You can pass a number or a function that returns a number
		 *
		 * @default "unlimited"
		 *
		 * @param organization
		 * @param request
		 * @returns
		 */
		maximumTeams?:
			| ((
					data: {
						organizationId: string;
						session: {
							user: User;
							session: Session;
						} | null;
					},
					request?: Request,
			  ) => number | Promise<number>)
			| number;
		/**
		 * By default, if an organization does only have one team, they'll not be able to remove it.
		 *
		 * You can disable this behavior by setting this to `false.
		 *
		 * @default false
		 */
		allowRemovingAllTeams?: boolean;
	};
	/**
	 * The expiration time for the invitation link.
	 *
	 * @default 48 hours
	 */
	invitationExpiresIn?: number;
	/**
	 * The maximum invitation a user can send.
	 *
	 * @default 100
	 */
	invitationLimit?:
		| number
		| ((
				data: {
					user: User;
					organization: Organization;
					member: Member;
				},
				ctx: AuthContext,
		  ) => Promise<number> | number);
	/**
	 * Cancel pending invitations on re-invite.
	 *
	 * @default true
	 */
	cancelPendingInvitationsOnReInvite?: boolean;
	/**
	 * Send an email with the
	 * invitation link to the user.
	 *
	 * Note: Better Auth doesn't
	 * generate invitation URLs.
	 * You'll need to construct the
	 * URL using the invitation ID
	 * and pass it to the
	 * acceptInvitation endpoint for
	 * the user to accept the
	 * invitation.
	 *
	 * @example
	 * ```ts
	 * sendInvitationEmail: async (data) => {
	 * 	const url = `https://yourapp.com/organization/
	 * accept-invitation?id=${data.id}`;
	 * 	await sendEmail(data.email, "Invitation to join
	 * organization", `Click the link to join the
	 * organization: ${url}`);
	 * }
	 * ```
	 */
	sendInvitationEmail?: (
		data: {
			/**
			 * the invitation id
			 */
			id: string;
			/**
			 * the role of the user
			 */
			role: string;
			/**
			 * the email of the user
			 */
			email: string;
			/**
			 * the organization the user is invited to join
			 */
			organization: Organization;
			/**
			 * the invitation object
			 */
			invitation: Invitation;
			/**
			 * the member who is inviting the user
			 */
			inviter: Member & {
				user: User;
			};
		},
		/**
		 * The request object
		 */
		request?: Request,
	) => Promise<void>;

	/**
	 * The schema for the organization plugin.
	 */
	schema?: {
		session?: {
			fields?: {
				activeOrganizationId?: string;
			};
		};
		organization?: {
			modelName?: string;
			fields?: {
				[key in keyof Omit<Organization, "id">]?: string;
			};
		};
		member?: {
			modelName?: string;
			fields?: {
				[key in keyof Omit<Member, "id">]?: string;
			};
		};
		invitation?: {
			modelName?: string;
			fields?: {
				[key in keyof Omit<Invitation, "id">]?: string;
			};
		};

		team?: {
			modelName?: string;
			fields?: {
				[key in keyof Omit<Team, "id">]?: string;
			};
		};
	};
	/**
	 * Configure how organization deletion is handled
	 */
	organizationDeletion?: {
		/**
		 * disable deleting organization
		 */
		disabled?: boolean;
		/**
		 * A callback that runs before the organization is
		 * deleted
		 *
		 * @param data - organization and user object
		 * @param request - the request object
		 * @returns
		 */
		beforeDelete?: (
			data: {
				organization: Organization;
				user: User;
			},
			request?: Request,
		) => Promise<void>;
		/**
		 * A callback that runs after the organization is
		 * deleted
		 *
		 * @param data - organization and user object
		 * @param request - the request object
		 * @returns
		 */
		afterDelete?: (
			data: {
				organization: Organization;
				user: User;
			},
			request?: Request,
		) => Promise<void>;
	};
	organizationCreation?: {
		disabled?: boolean;
		beforeCreate?: (
			data: {
				organization: Omit<Organization, "id">;
				user: User;
			},
			request?: Request,
		) => Promise<void | {
			data: Omit<Organization, "id">;
		}>;
		afterCreate?: (
			data: {
				organization: Organization;
				member: Member;
				user: User;
			},
			request?: Request,
		) => Promise<void>;
	};
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
export const organization = <O extends OrganizationOptions>(options?: O) => {
	let endpoints = {
		createOrganization,
		updateOrganization,
		deleteOrganization,
		setActiveOrganization: setActiveOrganization<O>(),
		getFullOrganization: getFullOrganization<O>(),
		listOrganizations,
		createInvitation: createInvitation(options as O),
		cancelInvitation,
		acceptInvitation,
		getInvitation,
		rejectInvitation,
		checkOrganizationSlug,
		addMember: addMember<O>(),
		removeMember,
		updateMemberRole: updateMemberRole(options as O),
		getActiveMember,
		leaveOrganization,
		listInvitations,
	};
	const teamSupport = options?.teams?.enabled;
	const teamEndpoints = {
		createTeam: createTeam(options as O),
		listOrganizationTeams,
		removeTeam,
		updateTeam,
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
						options: options as OrganizationOptions,
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
	} satisfies BetterAuthPlugin;
};
