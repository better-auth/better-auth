import { APIError } from "better-call";
import {
	type ZodArray,
	type ZodLiteral,
	type ZodObject,
	type ZodOptional,
	z,
} from "zod";
import type { User } from "../../adapters/schema";
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
} from "./access";
import { getOrgAdapter } from "./adapter";
import { orgSessionMiddleware } from "./call";
import {
	acceptInvitation,
	cancelInvitation,
	createInvitation,
	getActiveInvitation,
	rejectInvitation,
} from "./routes/crud-invites";
import { removeMember, updateMember } from "./routes/crud-members";
import {
	createOrganization,
	getFullOrganization,
	listOrganization,
	setActiveOrganization,
	updateOrganization,
} from "./routes/crud-org";
import type { Invitation } from "./schema";

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
	 *
	 */
	organizationLimit?: number;
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
	 *
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
	 * @param invitation  the invitation object
	 * @param email  the email of the user to be invited
	 *
	 * Make sure to construct the invitation link using the invitation id.
	 * @example
	 * ```ts
	 * const invitationLink = `${ctx.origin}/organization/accept-invitation?invitationId=$
	 * {invitation.id}`
	 *
	 * ```
	 */
	sendInvitationEmail?: (
		invitation: Invitation,
		email: string,
	) => Promise<void>;
}

export const organization = <O extends OrganizationOptions>(options?: O) => {
	const endpoints = {
		createOrganization,
		updateOrganization,
		setActiveOrganization,
		getFullOrganization,
		listOrganization,
		createInvitation,
		cancelInvitation,
		acceptInvitation,
		getActiveInvitation,
		rejectInvitation,
		removeMember,
		updateMember,
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
					const adapter = getOrgAdapter(ctx.context.adapter);
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
					},
					slug: {
						type: "string",
						unique: true,
					},
				},
			},
			member: {
				fields: {
					organizationId: {
						type: "string",
						required: true,
					},
					userId: {
						type: "string",
						required: true,
					},
					email: {
						type: "string",
						required: true,
					},
					name: {
						type: "string",
					},
					role: {
						type: "string",
						required: true,
						defaultValue: "member",
					},
				},
			},
			invitation: {
				fields: {
					organizationId: {
						type: "string",
						required: true,
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
					},
				},
			},
		},
	} satisfies BetterAuthPlugin;
};
