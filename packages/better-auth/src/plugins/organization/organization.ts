import { APIError } from "better-call";
import {
	type ZodArray,
	type ZodLiteral,
	type ZodObject,
	type ZodOptional,
	z,
} from "zod";
import type { User } from "../../db/schema";
import { createAuthEndpoint } from "../../api/call";
import { getSessionFromCtx } from "../../api/routes";
import type { AuthContext } from "../../init";
import type { BetterAuthPlugin } from "../../types/plugins";
import { shimContext } from "../../utils/shim";
import {
	type AccessControl,
	type Role,
	defaultRoles,
	type defaultStatements,
} from "../access";
import { getOrgAdapter } from "./adapter";
import { orgSessionMiddleware } from "./call";
import {
	acceptInvitation,
	cancelInvitation,
	createInvitation,
	getInvitation,
	rejectInvitation,
} from "./routes/crud-invites";
import { removeMember, updateMemberRole } from "./routes/crud-members";
import {
	createOrganization,
	deleteOrganization,
	getFullOrganization,
	listOrganization,
	setActiveOrganization,
	updateOrganization,
} from "./routes/crud-org";
import type { Invitation, Member, Organization } from "./schema";
import type { Prettify } from "../../types/helper";

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
	ac?: AccessControl;
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

	type DefaultStatements = typeof defaultStatements;
	type Statements = O["ac"] extends AccessControl<infer S>
		? S extends Record<string, any>
			? S & DefaultStatements
			: DefaultStatements
		: DefaultStatements;
	return {
		id: "organization",
		endpoints: {
			...api,
			hasPermission: createAuthEndpoint(
				"/organization/has-permission",
				{
					method: "POST",
					requireHeaders: true,
					body: z.object({
						permission: z.record(z.string(), z.array(z.string())),
					}) as unknown as ZodObject<{
						permission: ZodObject<{
							[key in keyof Statements]: ZodOptional<
								//@ts-expect-error TODO: fix this
								ZodArray<ZodLiteral<Statements[key][number]>>
							>;
						}>;
					}>,
					use: [orgSessionMiddleware],
				},
				async (ctx) => {
					if (!ctx.context.session.session.activeOrganizationId) {
						throw new APIError("BAD_REQUEST", {
							message: "No active organization",
						});
					}
					const adapter = getOrgAdapter(ctx.context);
					const member = await adapter.findMemberByOrgId({
						userId: ctx.context.session.user.id,
						organizationId:
							ctx.context.session.session.activeOrganizationId || "",
					});
					if (!member) {
						throw new APIError("UNAUTHORIZED", {
							message: "You are not a member of this organization",
						});
					}
					const role = roles[member.role];
					const result = role.authorize(ctx.body.permission as any);
					if (result.error) {
						return ctx.json(
							{
								error: result.error,
								success: false,
							},
							{
								status: 403,
							},
						);
					}
					return ctx.json({
						error: null,
						success: true,
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
					email: {
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
