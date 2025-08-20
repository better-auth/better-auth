import type { FieldAttribute } from "../../db";
import type { User, Session, AuthContext } from "../../types";
import type { AccessControl, Role } from "../access";
import type {
	Invitation,
	Member,
	Organization,
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
		| boolean
		| ((user: User & Record<string, any>) => Promise<boolean> | boolean);
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
	 * The maximum number of members allowed in an organization.
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
	 * @default false
	 */
	cancelPendingInvitationsOnReInvite?: boolean;
	/**
	 * Require email verification on accepting or rejecting an invitation
	 *
	 * @default false
	 */
	requireEmailVerificationOnInvitation?: boolean;
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
				activeTeamId?: string;
			};
		};
		organization?: {
			modelName?: string;
			fields?: {
				[key in keyof Omit<Organization, "id">]?: string;
			};
			additionalFields?: {
				[key in string]: FieldAttribute;
			};
		};
		member?: {
			modelName?: string;
			fields?: {
				[key in keyof Omit<Member, "id">]?: string;
			};
			additionalFields?: {
				[key in string]: FieldAttribute;
			};
		};
		invitation?: {
			modelName?: string;
			fields?: {
				[key in keyof Omit<Invitation, "id">]?: string;
			};
			additionalFields?: {
				[key in string]: FieldAttribute;
			};
		};
		team?: {
			modelName?: string;
			fields?: {
				[key in keyof Omit<Team, "id">]?: string;
			};
			additionalFields?: {
				[key in string]: FieldAttribute;
			};
		};
		teamMember?: {
			modelName?: string;
			fields?: {
				[key in keyof Omit<TeamMember, "id">]?: string;
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
				organization: Omit<Organization, "id"> & Record<string, any>;
				user: User;
			},
			request?: Request,
		) => Promise<void | {
			data: Record<string, any>;
		}>;
		afterCreate?: (
			data: {
				organization: Organization & Record<string, any>;
				member: Member & Record<string, any>;
				user: User;
			},
			request?: Request,
		) => Promise<void>;
	};
	/**
	 * Automatically create an organization for the user on sign up.
	 *
	 * @default false
	 */
	autoCreateOrganizationOnSignUp?: boolean;
}
