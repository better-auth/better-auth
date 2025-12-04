import type { AuthContext, GenericEndpointContext } from "@better-auth/core";
import type { DBFieldAttribute } from "@better-auth/core/db";
import type { Session, User } from "../../types";
import type { AccessControl, Role } from "../access";
import type {
	Invitation,
	Member,
	Organization,
	OrganizationRole,
	Team,
	TeamMember,
} from "./schema";

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
		| (
				| boolean
				| ((user: User & Record<string, any>) => Promise<boolean> | boolean)
		  )
		| undefined;
	/**
	 * The maximum number of organizations a user can create.
	 *
	 * You can also pass a function that returns a boolean
	 */
	organizationLimit?:
		| (number | ((user: User) => Promise<boolean> | boolean))
		| undefined;
	/**
	 * The role that is assigned to the creator of the
	 * organization.
	 *
	 * @default "owner"
	 */
	creatorRole?: string | undefined;
	/**
	 * The maximum number of members allowed in an organization.
	 *
	 * @default 100
	 */
	membershipLimit?: number | undefined;
	/**
	 * Configure the roles and permissions for the
	 * organization plugin.
	 */
	ac?: AccessControl | undefined;
	/**
	 * Custom permissions for roles.
	 */
	roles?:
		| {
				[key in string]?: Role<any>;
		  }
		| undefined;
	/**
	 * Dynamic access control for the organization plugin.
	 */
	dynamicAccessControl?:
		| {
				/**
				 * Whether to enable dynamic access control for the organization plugin.
				 *
				 * @default false
				 */
				enabled?: boolean;
				/**
				 * The maximum number of roles that can be created for an organization.
				 *
				 * @default Infinite
				 */
				maximumRolesPerOrganization?:
					| number
					| ((organizationId: string) => Promise<number> | number);
		  }
		| undefined;
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
				ctx?: GenericEndpointContext,
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
					ctx?: GenericEndpointContext,
			  ) => number | Promise<number>)
			| number;

		/**
		 * The maximum number of members per team.
		 *
		 * if `undefined`, there is no limit.
		 *
		 * @default undefined
		 */
		maximumMembersPerTeam?:
			| number
			| ((data: {
					teamId: string;
					session: { user: User; session: Session };
					organizationId: string;
			  }) => Promise<number> | number)
			| undefined;
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
	invitationExpiresIn?: number | undefined;
	/**
	 * The maximum invitation a user can send.
	 *
	 * @default 100
	 */
	invitationLimit?:
		| number
		| ((
				data: {
					user: User & Record<string, any>;
					organization: Organization & Record<string, any>;
					member: Member & Record<string, any>;
				},
				ctx: AuthContext,
		  ) => Promise<number> | number)
		| undefined;
	/**
	 * Cancel pending invitations on re-invite.
	 *
	 * @default false
	 */
	cancelPendingInvitationsOnReInvite?: boolean | undefined;
	/**
	 * Require email verification on accepting or rejecting an invitation
	 *
	 * @default false
	 */
	requireEmailVerificationOnInvitation?: boolean | undefined;
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
	 * 	 sendEmail(data.email, "Invitation to join
	 * organization", `Click the link to join the
	 * organization: ${url}`);
	 * }
	 * ```
	 */
	sendInvitationEmail?:
		| ((
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
		  ) => Promise<void>)
		| undefined;
	/**
	 * The schema for the organization plugin.
	 */
	schema?:
		| {
				session?: {
					fields?: {
						activeOrganizationId?: string;
						activeTeamId?: string;
					};
				};
				organization?: {
					modelName?: string;
					fields?: {
						[key in keyof Omit<Organization, "id">]?: string;
					};
					additionalFields?: {
						[key in string]: DBFieldAttribute;
					};
				};
				member?: {
					modelName?: string;
					fields?: {
						[key in keyof Omit<Member, "id">]?: string;
					};
					additionalFields?: {
						[key in string]: DBFieldAttribute;
					};
				};
				invitation?: {
					modelName?: string;
					fields?: {
						[key in keyof Omit<Invitation, "id">]?: string;
					};
					additionalFields?: {
						[key in string]: DBFieldAttribute;
					};
				};
				team?: {
					modelName?: string;
					fields?: {
						[key in keyof Omit<Team, "id">]?: string;
					};
					additionalFields?: {
						[key in string]: DBFieldAttribute;
					};
				};
				teamMember?: {
					modelName?: string;
					fields?: {
						[key in keyof Omit<TeamMember, "id">]?: string;
					};
				};
				organizationRole?: {
					modelName?: string;
					fields?: {
						[key in keyof Omit<OrganizationRole, "id">]?: string;
					};
					additionalFields?: {
						[key in string]: DBFieldAttribute;
					};
				};
		  }
		| undefined;
	/**
	 * Disable organization deletion
	 *
	 * @default false
	 */
	disableOrganizationDeletion?: boolean | undefined;
	/**
	 * Configure how organization deletion is handled
	 *
	 * @deprecated Use `organizationHooks` instead
	 */
	organizationDeletion?:
		| {
				/**
				 * disable deleting organization
				 *
				 * @deprecated Use `disableOrganizationDeletion` instead
				 */
				disabled?: boolean;
				/**
				 * A callback that runs before the organization is
				 * deleted
				 *
				 * @deprecated Use `organizationHooks` instead
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
				 * @deprecated Use `organizationHooks` instead
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
		  }
		| undefined;
	/**
	 * @deprecated Use `organizationHooks` instead
	 */
	organizationCreation?:
		| {
				disabled?: boolean;
				beforeCreate?: (
					data: {
						organization: Omit<Organization, "id"> & Record<string, any>;
						user: User & Record<string, any>;
					},
					request?: Request,
				) => Promise<void | {
					data: Record<string, any>;
				}>;
				afterCreate?: (
					data: {
						organization: Organization & Record<string, any>;
						member: Member & Record<string, any>;
						user: User & Record<string, any>;
					},
					request?: Request,
				) => Promise<void>;
		  }
		| undefined;
	/**
	 * Hooks for organization
	 */
	organizationHooks?:
		| {
				/**
				 * A callback that runs before the organization is created
				 *
				 * You can return a `data` object to override the default data.
				 *
				 * @example
				 * ```ts
				 * beforeCreateOrganization: async (data) => {
				 * 	return {
				 * 		data: {
				 * 			...data.organization,
				 * 		},
				 * 	};
				 * }
				 * ```
				 *
				 * You can also throw `new APIError` to stop the organization creation.
				 *
				 * @example
				 * ```ts
				 * beforeCreateOrganization: async (data) => {
				 * 	throw new APIError("BAD_REQUEST", {
				 * 		message: "Organization creation is disabled",
				 * 	});
				 * }
				 */
				beforeCreateOrganization?: (data: {
					organization: {
						name?: string;
						slug?: string;
						logo?: string;
						metadata?: Record<string, any>;
						[key: string]: any;
					};
					user: User & Record<string, any>;
				}) => Promise<void | {
					data: Record<string, any>;
				}>;
				/**
				 * A callback that runs after the organization is created
				 */
				afterCreateOrganization?: (data: {
					organization: Organization & Record<string, any>;
					member: Member & Record<string, any>;
					user: User & Record<string, any>;
				}) => Promise<void>;
				/**
				 * A callback that runs before the organization is updated
				 *
				 * You can return a `data` object to override the default data.
				 *
				 * @example
				 * ```ts
				 * beforeUpdateOrganization: async (data) => {
				 * 	return { data: { ...data.organization } };
				 * }
				 */
				beforeUpdateOrganization?: (data: {
					organization: {
						name?: string;
						slug?: string;
						logo?: string;
						metadata?: Record<string, any>;
						[key: string]: any;
					};
					user: User & Record<string, any>;
					member: Member & Record<string, any>;
				}) => Promise<void | {
					data: {
						name?: string;
						slug?: string;
						logo?: string;
						metadata?: Record<string, any>;
						[key: string]: any;
					};
				}>;
				/**
				 * A callback that runs after the organization is updated
				 *
				 * @example
				 * ```ts
				 * afterUpdateOrganization: async (data) => {
				 * 	console.log(data.organization);
				 * }
				 * ```
				 */
				afterUpdateOrganization?: (data: {
					/**
					 * Updated organization object
					 *
					 * This could be `null` if an adapter doesn't return updated organization.
					 */
					organization: (Organization & Record<string, any>) | null;
					user: User & Record<string, any>;
					member: Member & Record<string, any>;
				}) => Promise<void>;
				/**
				 * A callback that runs before the organization is deleted
				 */
				beforeDeleteOrganization?: (data: {
					organization: Organization & Record<string, any>;
					user: User & Record<string, any>;
				}) => Promise<void>;
				/**
				 * A callback that runs after the organization is deleted
				 */
				afterDeleteOrganization?: (data: {
					organization: Organization & Record<string, any>;
					user: User & Record<string, any>;
				}) => Promise<void>;
				/**
				 * Member hooks
				 */

				/**
				 * A callback that runs before a member is added to an organization
				 *
				 * You can return a `data` object to override the default data.
				 *
				 * @example
				 * ```ts
				 * beforeAddMember: async (data) => {
				 * 	return {
				 * 		data: {
				 * 			...data.member,
				 * 			role: "custom-role"
				 * 		}
				 * 	};
				 * }
				 * ```
				 */
				beforeAddMember?: (data: {
					member: {
						userId: string;
						organizationId: string;
						role: string;
						[key: string]: any;
					};
					user: User & Record<string, any>;
					organization: Organization & Record<string, any>;
				}) => Promise<void | {
					data: Record<string, any>;
				}>;

				/**
				 * A callback that runs after a member is added to an organization
				 */
				afterAddMember?: (data: {
					member: Member & Record<string, any>;
					user: User & Record<string, any>;
					organization: Organization & Record<string, any>;
				}) => Promise<void>;

				/**
				 * A callback that runs before a member is removed from an organization
				 */
				beforeRemoveMember?: (data: {
					member: Member & Record<string, any>;
					user: User & Record<string, any>;
					organization: Organization & Record<string, any>;
				}) => Promise<void>;

				/**
				 * A callback that runs after a member is removed from an organization
				 */
				afterRemoveMember?: (data: {
					member: Member & Record<string, any>;
					user: User & Record<string, any>;
					organization: Organization & Record<string, any>;
				}) => Promise<void>;

				/**
				 * A callback that runs before a member's role is updated
				 *
				 * You can return a `data` object to override the default data.
				 */
				beforeUpdateMemberRole?: (data: {
					member: Member & Record<string, any>;
					newRole: string;
					user: User & Record<string, any>;
					organization: Organization & Record<string, any>;
				}) => Promise<void | {
					data: {
						role: string;
						[key: string]: any;
					};
				}>;

				/**
				 * A callback that runs after a member's role is updated
				 */
				afterUpdateMemberRole?: (data: {
					member: Member & Record<string, any>;
					previousRole: string;
					user: User & Record<string, any>;
					organization: Organization & Record<string, any>;
				}) => Promise<void>;

				/**
				 * Invitation hooks
				 */

				/**
				 * A callback that runs before an invitation is created
				 *
				 * You can return a `data` object to override the default data.
				 *
				 * @example
				 * ```ts
				 * beforeCreateInvitation: async (data) => {
				 * 	return {
				 * 		data: {
				 * 			...data.invitation,
				 * 			expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7) // 7 days
				 * 		}
				 * 	};
				 * }
				 * ```
				 */
				beforeCreateInvitation?: (data: {
					invitation: {
						email: string;
						role: string;
						organizationId: string;
						inviterId: string;
						teamId?: string;
						[key: string]: any;
					};
					inviter: User & Record<string, any>;
					organization: Organization & Record<string, any>;
				}) => Promise<void | {
					data: Record<string, any>;
				}>;

				/**
				 * A callback that runs after an invitation is created
				 */
				afterCreateInvitation?: (data: {
					invitation: Invitation & Record<string, any>;
					inviter: User & Record<string, any>;
					organization: Organization & Record<string, any>;
				}) => Promise<void>;

				/**
				 * A callback that runs before an invitation is accepted
				 */
				beforeAcceptInvitation?: (data: {
					invitation: Invitation & Record<string, any>;
					user: User & Record<string, any>;
					organization: Organization & Record<string, any>;
				}) => Promise<void>;

				/**
				 * A callback that runs after an invitation is accepted
				 */
				afterAcceptInvitation?: (data: {
					invitation: Invitation & Record<string, any>;
					member: Member & Record<string, any>;
					user: User & Record<string, any>;
					organization: Organization & Record<string, any>;
				}) => Promise<void>;

				/**
				 * A callback that runs before an invitation is rejected
				 */
				beforeRejectInvitation?: (data: {
					invitation: Invitation & Record<string, any>;
					user: User & Record<string, any>;
					organization: Organization & Record<string, any>;
				}) => Promise<void>;

				/**
				 * A callback that runs after an invitation is rejected
				 */
				afterRejectInvitation?: (data: {
					invitation: Invitation & Record<string, any>;
					user: User & Record<string, any>;
					organization: Organization & Record<string, any>;
				}) => Promise<void>;

				/**
				 * A callback that runs before an invitation is cancelled
				 */
				beforeCancelInvitation?: (data: {
					invitation: Invitation & Record<string, any>;
					cancelledBy: User & Record<string, any>;
					organization: Organization & Record<string, any>;
				}) => Promise<void>;

				/**
				 * A callback that runs after an invitation is cancelled
				 */
				afterCancelInvitation?: (data: {
					invitation: Invitation & Record<string, any>;
					cancelledBy: User & Record<string, any>;
					organization: Organization & Record<string, any>;
				}) => Promise<void>;

				/**
				 * Team hooks (when teams are enabled)
				 */

				/**
				 * A callback that runs before a team is created
				 *
				 * You can return a `data` object to override the default data.
				 */
				beforeCreateTeam?: (data: {
					team: {
						name: string;
						organizationId: string;
						[key: string]: any;
					};
					user?: User & Record<string, any>;
					organization: Organization & Record<string, any>;
				}) => Promise<void | {
					data: Record<string, any>;
				}>;

				/**
				 * A callback that runs after a team is created
				 */
				afterCreateTeam?: (data: {
					team: Team & Record<string, any>;
					user?: User & Record<string, any>;
					organization: Organization & Record<string, any>;
				}) => Promise<void>;

				/**
				 * A callback that runs before a team is updated
				 *
				 * You can return a `data` object to override the default data.
				 */
				beforeUpdateTeam?: (data: {
					team: Team & Record<string, any>;
					updates: {
						name?: string;
						[key: string]: any;
					};
					user: User & Record<string, any>;
					organization: Organization & Record<string, any>;
				}) => Promise<void | {
					data: Record<string, any>;
				}>;

				/**
				 * A callback that runs after a team is updated
				 */
				afterUpdateTeam?: (data: {
					team: (Team & Record<string, any>) | null;
					user: User & Record<string, any>;
					organization: Organization & Record<string, any>;
				}) => Promise<void>;

				/**
				 * A callback that runs before a team is deleted
				 */
				beforeDeleteTeam?: (data: {
					team: Team & Record<string, any>;
					user?: User & Record<string, any>;
					organization: Organization & Record<string, any>;
				}) => Promise<void>;

				/**
				 * A callback that runs after a team is deleted
				 */
				afterDeleteTeam?: (data: {
					team: Team & Record<string, any>;
					user?: User & Record<string, any>;
					organization: Organization & Record<string, any>;
				}) => Promise<void>;

				/**
				 * A callback that runs before a member is added to a team
				 */
				beforeAddTeamMember?: (data: {
					teamMember: {
						teamId: string;
						userId: string;
						[key: string]: any;
					};
					team: Team & Record<string, any>;
					user: User & Record<string, any>;
					organization: Organization & Record<string, any>;
				}) => Promise<void | {
					data: Record<string, any>;
				}>;

				/**
				 * A callback that runs after a member is added to a team
				 */
				afterAddTeamMember?: (data: {
					teamMember: TeamMember & Record<string, any>;
					team: Team & Record<string, any>;
					user: User & Record<string, any>;
					organization: Organization & Record<string, any>;
				}) => Promise<void>;

				/**
				 * A callback that runs before a member is removed from a team
				 */
				beforeRemoveTeamMember?: (data: {
					teamMember: TeamMember & Record<string, any>;
					team: Team & Record<string, any>;
					user: User & Record<string, any>;
					organization: Organization & Record<string, any>;
				}) => Promise<void>;

				/**
				 * A callback that runs after a member is removed from a team
				 */
				afterRemoveTeamMember?: (data: {
					teamMember: TeamMember & Record<string, any>;
					team: Team & Record<string, any>;
					user: User & Record<string, any>;
					organization: Organization & Record<string, any>;
				}) => Promise<void>;
		  }
		| undefined;
}
