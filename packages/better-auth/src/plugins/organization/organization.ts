import type { User } from "../../db/schema";
import { getSessionFromCtx } from "../../api/routes";
import type { AuthContext } from "../../init";
import type { BetterAuthPlugin } from "../../types/plugins";
import { shimContext } from "../../utils/shim";
import { type Role, defaultRoles } from "../access";
import {
	acceptInvitation,
	cancelInvitation,
	createInvitation,
	getInvitation,
	rejectInvitation,
} from "./routes/crud-invites";
import {
	getActiveMember,
	removeMember,
	updateMemberRole,
} from "./routes/crud-members";
import {
	createOrganization,
	deleteOrganization,
	getFullOrganization,
	listOrganization,
	setActiveOrganization,
	updateOrganization,
} from "./routes/crud-org";
import type {
	Invitation,
	Member,
	MemberWithUser,
	Organization,
} from "./schema";
import type { Prettify } from "../../types/helper";

export interface AC {
	/**
	 * Can the user invite members to the organization?
	 *
	 * @default (member) => (member.role === "admin" || member.role === "owner")
	 */
	canInvite?: (member: MemberWithUser) => boolean | Promise<boolean>;
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
	 * The role that is assigned to the creator of the organization.
	 *
	 * @default "admin"
	 */
	creatorRole?: "admin" | "owner";
	/**
	 * The number of memberships a user can have in an organization.
	 *
	 * @default "unlimited"
	 */
	membershipLimit?: number;
	/**
	 * Configure the roles and permissions for the organization plugin.
	 *
	 */
	accessControl?: AC;
	/**
	 * Custom permissions for roles.
	 */
	roles?: {
		[key in "admin" | "member" | "owner"]?: Role<any>;
	};
	/**
	 * The expiration time for the invitation link.
	 *
	 * @default 48 hours
	 */
	invitationExpiresIn?: number;
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
			role: "admin" | "owner" | "member";
			/**
			 * the email of the user
			 */
			email: string;
			/**
			 * the organization the user is invited to
			 */
			organization: Organization;
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
}
/**
 * Organization plugin for Better Auth. Organization allows you to create teams, members,
 * and manage access control for your users.
 *
 * @example
 * ```ts
 * const auth = createAuth({
 * 	plugins: [
 * 		organization({
 * 			allowUserToCreateOrganization: true,
 * 		}),
 * 	],
 * });
 * ```
 */
export const organization = <O extends OrganizationOptions>(options?: O) => {
	const endpoints = {
		createOrganization,
		updateOrganization,
		deleteOrganization,
		setActiveOrganization,
		getFullOrganization,
		listOrganization,
		createInvitation,
		cancelInvitation,
		acceptInvitation,
		getInvitation,
		rejectInvitation,
		removeMember,
		updateMemberRole,
		getActiveMember,
	};

	const roles = {
		...defaultRoles,
		...options?.roles,
	};

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
		endpoints: api,
		schema: {
			session: {
				fields: {
					activeOrganizationId: {
						type: "string",
						required: false,
					},
				},
			},
			organization: {
				fields: {
					name: {
						type: "string",
						required: true,
					},
					slug: {
						type: "string",
						unique: true,
					},
					logo: {
						type: "string",
						required: false,
					},
					createdAt: {
						type: "date",
						required: true,
					},
					metadata: {
						type: "string",
						required: false,
					},
				},
			},
			member: {
				fields: {
					organizationId: {
						type: "string",
						required: true,
						references: {
							model: "organization",
							field: "id",
						},
					},
					userId: {
						type: "string",
						required: true,
					},
					role: {
						type: "string",
						required: true,
						defaultValue: "member",
					},
					createdAt: {
						type: "date",
						required: true,
					},
				},
			},
			invitation: {
				fields: {
					organizationId: {
						type: "string",
						required: true,
						references: {
							model: "organization",
							field: "id",
						},
					},
					email: {
						type: "string",
						required: true,
					},
					role: {
						type: "string",
						required: false,
					},
					status: {
						type: "string",
						required: true,
						defaultValue: "pending",
					},
					expiresAt: {
						type: "date",
						required: true,
					},
					inviterId: {
						type: "string",
						references: {
							model: "user",
							field: "id",
						},
						required: true,
					},
				},
			},
		},
		$Infer: {
			Organization: {} as Organization,
			Invitation: {} as Invitation,
			Member: {} as Member,
			ActiveOrganization: {} as Prettify<
				Organization & {
					members: Prettify<
						Member & {
							user: {
								id: string;
								name: string;
								email: string;
								image: string | undefined;
							};
						}
					>[];
					invitations: Invitation[];
				}
			>,
		},
	} satisfies BetterAuthPlugin;
};
