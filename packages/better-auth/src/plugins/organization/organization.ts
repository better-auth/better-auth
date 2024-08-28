import { z, ZodArray, ZodLiteral, ZodObject, ZodOptional } from "zod";
import { User } from "../../adapters/schema";
import { createAuthEndpoint } from "../../api/call";
import { BetterAuthPlugin } from "../../types/plugins";
import { shimContext } from "../../utils/shim";
import {
	createOrganization,
	listOrganization,
	updateOrganization,
} from "./routes/crud-org";
import { AccessControl, defaultRoles, defaultStatements, Role } from "./access";
import { getSession } from "../../api/routes";
import { AuthContext } from "../../init";
import {
	acceptInvitation,
	cancelInvitation,
	createInvitation,
	rejectInvitation,
} from "./routes/crud-invites";
import { deleteMember, updateMember } from "./routes/crud-members";

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
}

export const organization = <O extends OrganizationOptions>(options?: O) => {
	const endpoints = {
		createOrganization,
		updateOrganization,
		listOrganization,
		createInvitation,
		cancelInvitation,
		acceptInvitation,
		rejectInvitation,
		deleteMember,
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
			return await getSession(context);
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
				"/org/has-permission",
				{
					method: "POST",
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
				},
				async () => {
					const hasPerm = true;
					return hasPerm;
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
				},
			},
		},
	} satisfies BetterAuthPlugin;
};
