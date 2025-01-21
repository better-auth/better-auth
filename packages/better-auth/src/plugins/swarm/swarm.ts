import { APIError } from "better-call";
import {
	type ZodArray,
	type ZodLiteral,
	type ZodObject,
	type ZodOptional,
	ZodString,
	z,
} from "zod";
import type { User } from "../../types";
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
import { getSwmAdapter } from "./adapter";
import { swmSessionMiddleware } from "./call";
import {
	acceptInvitation,
	cancelInvitation,
	createInvitation,
	getInvitation,
	rejectInvitation,
} from "./routes/crud-invites";
import {
	addMember,
	getActiveMember,
	removeMember,
	updateMemberRole,
} from "./routes/crud-members";
import {
	createSwarm,
	deleteSwarm,
	getFullSwarm,
	listSwarms,
	setActiveSwarm,
	updateSwarm,
} from "./routes/crud-swm";
import type { Invitation, Member, Swarm } from "./schema";
import type { Prettify } from "../../types/helper";
import { SWARM_ERROR_CODES } from "./error-codes";

export interface SwarmOptions {
	/**
	 * Configure whether new users are able to create new swarms.
	 * You can also pass a function that returns a boolean.
	 *
	 * 	@example
	 * ```ts
	 * allowUserToCreateSwarm: async (user) => {
	 * 		const plan = await getUserPlan(user);
	 *      return plan.name === "pro";
	 * }
	 * ```
	 * @default true
	 */
	allowUserToCreateSwarm?:
		| boolean
		| ((user: User) => Promise<boolean> | boolean);
	/**
	 * The maximum number of swarms a user can create.
	 *
	 * You can also pass a function that returns a boolean
	 */
	swarmLimit?: number | ((user: User) => Promise<boolean> | boolean);
	/**
	 * The role that is assigned to the creator of the
	 * swarm.
	 *
	 * @default "owner"
	 */
	creatorRole?: string;
	/**
	 * The number of memberships a user can have in an swarm.
	 *
	 * @default "unlimited"
	 */
	membershipLimit?: number;
	/**
	 * Configure the roles and permissions for the
	 * swarm plugin.
	 */
	ac?: AccessControl;
	/**
	 * Custom permissions for roles.
	 */
	roles?: {
		[key in string]?: Role<any>;
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
	 * 	const url = `https://yourapp.com/swarm/
	 * accept-invitation?id=${data.id}`;
	 * 	await sendEmail(data.email, "Invitation to join
	 * swarm", `Click the link to join the
	 * swarm: ${url}`);
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
			 * the swarm the user is invited to join
			 */
			swarm: Swarm;
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
	 * The schema for the swarm plugin.
	 */
	schema?: {
		session?: {
			fields?: {
				activeSwarmId?: string;
			};
		};
		swarm?: {
			modelName?: string;
			fields?: {
				[key in keyof Omit<Swarm, "id">]?: string;
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
	};
	/**
	 * Configure how swarm deletion is handled
	 */
	swarmDeletion?: {
		/**
		 * disable deleting swarm
		 */
		disabled?: boolean;
		/**
		 * A callback that runs before the swarm is
		 * deleted
		 *
		 * @param data - swarm and user object
		 * @param request - the request object
		 * @returns
		 */
		beforeDelete?: (
			data: {
				swarm: Swarm;
				user: User;
			},
			request?: Request,
		) => Promise<void>;
		/**
		 * A callback that runs after the swarm is
		 * deleted
		 *
		 * @param data - swarm and user object
		 * @param request - the request object
		 * @returns
		 */
		afterDelete?: (
			data: {
				swarm: Swarm;
				user: User;
			},
			request?: Request,
		) => Promise<void>;
	};
}
/**
 * Swarm plugin for Better Auth. Swarm allows you to create teams, members,
 * and manage access control for your users.
 *
 * @example
 * ```ts
 * const auth = createAuth({
 * 	plugins: [
 * 		swarm({
 * 			allowUserToCreateSwarm: true,
 * 		}),
 * 	],
 * });
 * ```
 */
export const swarm = <O extends SwarmOptions>(options?: O) => {
	const endpoints = {
		createSwarm,
		updateSwarm,
		deleteSwarm,
		setActiveSwarm,
		getFullSwarm,
		listSwarms,
		createInvitation: createInvitation(options as O),
		cancelInvitation,
		acceptInvitation,
		getInvitation,
		rejectInvitation,
		addMember: addMember<O>(),
		removeMember,
		updateMemberRole: updateMemberRole(options as O),
		getActiveMember,
	};

	const roles = {
		...defaultRoles,
		...options?.roles,
	};

	const api = shimContext(endpoints, {
		swmOptions: options || {},
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
		id: "swarm",
		endpoints: {
			...api,
			hasPermission: createAuthEndpoint(
				"/swarm/has-permission",
				{
					method: "POST",
					requireHeaders: true,
					body: z.object({
						swarmId: z.string().optional(),
						permission: z.record(z.string(), z.array(z.string())),
					}) as unknown as ZodObject<{
						permission: ZodObject<{
							[key in keyof Statements]: ZodOptional<
								//@ts-expect-error TODO: fix this
								ZodArray<ZodLiteral<Statements[key][number]>>
							>;
						}>;
						swarmId: ZodOptional<ZodString>;
					}>,
					use: [swmSessionMiddleware],
					metadata: {
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
												},
											},
											required: ["permission"],
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
					if (
						!ctx.body.permission ||
						Object.keys(ctx.body.permission).length > 1
					) {
						throw new APIError("BAD_REQUEST", {
							message:
								"invalid permission check. you can only check one resource permission at a time.",
						});
					}
					const activeSwarmId =
						ctx.body.swarmId ||
						ctx.context.session.session.activeSwarmId;
					if (!activeSwarmId) {
						throw new APIError("BAD_REQUEST", {
							message: SWARM_ERROR_CODES.NO_ACTIVE_SWARM,
						});
					}
					const adapter = getSwmAdapter(ctx.context);
					const member = await adapter.findMemberBySwmId({
						userId: ctx.context.session.user.id,
						swarmId: activeSwarmId,
					});
					if (!member) {
						throw new APIError("UNAUTHORIZED", {
							message:
								SWARM_ERROR_CODES.USER_IS_NOT_A_MEMBER_OF_THE_SWARM,
						});
					}
					const role = roles[member.role as keyof typeof roles];
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
					activeSwarmId: {
						type: "string",
						required: false,
						fieldName: options?.schema?.session?.fields?.activeSwarmId,
					},
				},
			},
			swarm: {
				modelName: options?.schema?.swarm?.modelName,
				fields: {
					name: {
						type: "string",
						required: true,
						fieldName: options?.schema?.swarm?.fields?.name,
					},
					slug: {
						type: "string",
						unique: true,
						fieldName: options?.schema?.swarm?.fields?.slug,
					},
					logo: {
						type: "string",
						required: false,
						fieldName: options?.schema?.swarm?.fields?.logo,
					},
					createdAt: {
						type: "date",
						required: true,
						fieldName: options?.schema?.swarm?.fields?.createdAt,
					},
					metadata: {
						type: "string",
						required: false,
						fieldName: options?.schema?.swarm?.fields?.metadata,
					},
				},
			},
			member: {
				modelName: options?.schema?.member?.modelName,
				fields: {
					swarmId: {
						type: "string",
						required: true,
						references: {
							model: "swarm",
							field: "id",
						},
						fieldName: options?.schema?.member?.fields?.swarmId,
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
						defaultValue: "member",
						fieldName: options?.schema?.member?.fields?.role,
					},
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
					swarmId: {
						type: "string",
						required: true,
						references: {
							model: "swarm",
							field: "id",
						},
						fieldName: options?.schema?.invitation?.fields?.swarmId,
					},
					email: {
						type: "string",
						required: true,
						fieldName: options?.schema?.invitation?.fields?.email,
					},
					role: {
						type: "string",
						required: false,
						fieldName: options?.schema?.invitation?.fields?.role,
					},
					status: {
						type: "string",
						required: true,
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
		},
		$Infer: {
			Swarm: {} as Swarm,
			Invitation: {} as Invitation,
			Member: {} as Member,
			ActiveSwarm: {} as Prettify<
				Swarm & {
					members: Prettify<
						Member & {
							user: {
								id: string;
								name: string;
								email: string;
								image?: string | null;
							};
						}
					>[];
					invitations: Invitation[];
				}
			>,
		},
		$ERROR_CODES: SWARM_ERROR_CODES,
	} satisfies BetterAuthPlugin;
};
