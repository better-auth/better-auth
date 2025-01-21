import { z } from "zod";
import {
	APIError,
	createAuthEndpoint,
	createAuthMiddleware,
	getSessionFromCtx,
} from "../../api";
import {
	type BetterAuthPlugin,
	type InferOptionSchema,
	type AuthPluginSchema,
	type Session,
	type User,
	type Where,
} from "../../types";
import { deleteSessionCookie, setSessionCookie } from "../../cookies";
import { getDate } from "../../utils/date";
import { getEndpointResponse } from "../../utils/plugin-helper";
import { mergeSchema } from "../../db/schema";

export interface UserWithRole extends User {
	role?: string | null;
	banned?: boolean | null;
	banReason?: string | null;
	banExpires?: Date | null;
}

export interface SessionWithImpersonatedBy extends Session {
	impersonatedBy?: string;
}

interface AdminOptions {
	/**
	 * The default role for a user created by the admin
	 *
	 * @default "user"
	 */
	defaultRole?: string | false;
	/**
	 * The role required to access admin endpoints
	 *
	 * Can be an array of roles
	 *
	 * @default "admin"
	 */
	adminRole?: string | string[];
	/**
	 * A default ban reason
	 *
	 * By default, no reason is provided
	 */
	defaultBanReason?: string;
	/**
	 * Number of seconds until the ban expires
	 *
	 * By default, the ban never expires
	 */
	defaultBanExpiresIn?: number;
	/**
	 * Duration of the impersonation session in seconds
	 *
	 * By default, the impersonation session lasts 1 hour
	 */
	impersonationSessionDuration?: number;
	/**
	 * Custom schema for the admin plugin
	 */
	schema?: InferOptionSchema<typeof schema>;
}

export const admin = <O extends AdminOptions>(options?: O) => {
	const opts = {
		defaultRole: "user",
		adminRole: "admin",
		...options,
	};
	const ERROR_CODES = {
		FAILED_TO_CREATE_USER: "Failed to create user",
		USER_ALREADY_EXISTS: "User already exists",
		USER_NOT_FOUND: "User not found",
		YOU_CANNOT_BAN_YOURSELF: "You cannot ban yourself",
		ONLY_ADMINS_CAN_ACCESS_THIS_ENDPOINT:
			"Only admins can access this endpoint",
	} as const;
	const adminMiddleware = createAuthMiddleware(async (ctx) => {
		const session = await getSessionFromCtx(ctx);
		if (!session?.session) {
			throw new APIError("UNAUTHORIZED");
		}
		const user = session.user as UserWithRole;
		if (
			!user.role ||
			(Array.isArray(opts.adminRole)
				? !opts.adminRole.includes(user.role)
				: user.role !== opts.adminRole)
		) {
			throw new APIError("FORBIDDEN", {
				message: "Only admins can access this endpoint",
			});
		}
		return {
			session: {
				user: user,
				session: session.session,
			},
		};
	});
	return {
		id: "admin",
		init(ctx) {
			return {
				options: {
					databaseHooks: {
						user: {
							create: {
								async before(user) {
									if (options?.defaultRole === false) {
										return;
									}
									return {
										data: {
											role: options?.defaultRole ?? "user",
											...user,
										},
									};
								},
							},
						},
						session: {
							create: {
								async before(session) {
									const user = (await ctx.internalAdapter.findUserById(
										session.userId,
									)) as UserWithRole;

									if (user.banned) {
										if (
											user.banExpires &&
											user.banExpires.getTime() < Date.now()
										) {
											await ctx.internalAdapter.updateUser(session.userId, {
												banned: false,
												banReason: null,
												banExpires: null,
											});
											return;
										}
										return false;
									}
								},
							},
						},
					},
				},
			};
		},
		hooks: {
			after: [
				{
					matcher(context) {
						return context.path === "/list-sessions";
					},
					handler: createAuthMiddleware(async (ctx) => {
						const response =
							await getEndpointResponse<SessionWithImpersonatedBy[]>(ctx);

						if (!response) {
							return;
						}
						const newJson = response.filter((session) => {
							return !session.impersonatedBy;
						});

						return ctx.json(newJson);
					}),
				},
			],
		},
		endpoints: {
			setRole: createAuthEndpoint(
				"/admin/set-role",
				{
					method: "POST",
					body: z.object({
						userId: z.string({
							description: "The user id",
						}),
						role: z.string({
							description: "The role to set. `admin` or `user` by default",
						}),
					}),
					use: [adminMiddleware],
					metadata: {
						openapi: {
							operationId: "setRole",
							summary: "Set the role of a user",
							description: "Set the role of a user",
							responses: {
								200: {
									description: "User role updated",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													user: {
														$ref: "#/components/schemas/User",
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
				async (ctx) => {
					const updatedUser = await ctx.context.internalAdapter.updateUser(
						ctx.body.userId,
						{
							role: ctx.body.role,
						},
					);
					return ctx.json({
						user: updatedUser as UserWithRole,
					});
				},
			),
			createUser: createAuthEndpoint(
				"/admin/create-user",
				{
					method: "POST",
					body: z.object({
						email: z.string({
							description: "The email of the user",
						}),
						password: z.string({
							description: "The password of the user",
						}),
						name: z.string({
							description: "The name of the user",
						}),
						role: z.string({
							description: "The role of the user",
						}),
						/**
						 * extra fields for user
						 */
						data: z.optional(
							z.record(z.any(), {
								description:
									"Extra fields for the user. Including custom additional fields.",
							}),
						),
					}),
					use: [adminMiddleware],
					metadata: {
						openapi: {
							operationId: "createUser",
							summary: "Create a new user",
							description: "Create a new user",
							responses: {
								200: {
									description: "User created",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													user: {
														$ref: "#/components/schemas/User",
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
				async (ctx) => {
					const existUser = await ctx.context.internalAdapter.findUserByEmail(
						ctx.body.email,
					);
					if (existUser) {
						throw new APIError("BAD_REQUEST", {
							message: ERROR_CODES.USER_ALREADY_EXISTS,
						});
					}
					const user =
						await ctx.context.internalAdapter.createUser<UserWithRole>({
							email: ctx.body.email,
							name: ctx.body.name,
							role: ctx.body.role,
							...ctx.body.data,
						});

					if (!user) {
						throw new APIError("INTERNAL_SERVER_ERROR", {
							message: ERROR_CODES.FAILED_TO_CREATE_USER,
						});
					}
					const hashedPassword = await ctx.context.password.hash(
						ctx.body.password,
					);
					await ctx.context.internalAdapter.linkAccount({
						accountId: user.id,
						providerId: "credential",
						password: hashedPassword,
						userId: user.id,
					});
					return ctx.json({
						user: user as UserWithRole,
					});
				},
			),
			listUsers: createAuthEndpoint(
				"/admin/list-users",
				{
					method: "GET",
					use: [adminMiddleware],
					query: z.object({
						searchValue: z
							.string({
								description: "The value to search for",
							})
							.optional(),
						searchField: z
							.enum(["email", "name"], {
								description:
									"The field to search in, defaults to email. Can be `email` or `name`",
							})
							.optional(),
						searchOperator: z
							.enum(["contains", "starts_with", "ends_with"], {
								description:
									"The operator to use for the search. Can be `contains`, `starts_with` or `ends_with`",
							})
							.optional(),
						limit: z
							.string({
								description: "The number of users to return",
							})
							.or(z.number())
							.optional(),
						offset: z
							.string({
								description: "The offset to start from",
							})
							.or(z.number())
							.optional(),
						sortBy: z
							.string({
								description: "The field to sort by",
							})
							.optional(),
						sortDirection: z
							.enum(["asc", "desc"], {
								description: "The direction to sort by",
							})
							.optional(),
						filterField: z
							.string({
								description: "The field to filter by",
							})
							.optional(),
						filterValue: z
							.string({
								description: "The value to filter by",
							})
							.or(z.number())
							.or(z.boolean())
							.optional(),
						filterOperator: z
							.enum(["eq", "ne", "lt", "lte", "gt", "gte"], {
								description: "The operator to use for the filter",
							})
							.optional(),
					}),
					metadata: {
						openapi: {
							operationId: "listUsers",
							summary: "List users",
							description: "List users",
							responses: {
								200: {
									description: "List of users",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													users: {
														type: "array",
														items: {
															$ref: "#/components/schemas/User",
														},
													},
													total: {
														type: "number",
													},
													limit: {
														type: ["number", "undefined"],
													},
													offset: {
														type: ["number", "undefined"],
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
				async (ctx) => {
					const where: Where[] = [];

					if (ctx.query?.searchValue) {
						where.push({
							field: ctx.query.searchField || "email",
							operator: ctx.query.searchOperator || "contains",
							value: ctx.query.searchValue,
						});
					}

					if (ctx.query?.filterValue) {
						where.push({
							field: ctx.query.filterField || "email",
							operator: ctx.query.filterOperator || "eq",
							value: ctx.query.filterValue,
						});
					}

					try {
						const users = await ctx.context.internalAdapter.listUsers(
							Number(ctx.query?.limit) || undefined,
							Number(ctx.query?.offset) || undefined,
							ctx.query?.sortBy
								? {
										field: ctx.query.sortBy,
										direction: ctx.query.sortDirection || "asc",
									}
								: undefined,
							where.length ? where : undefined,
						);
						const total = await ctx.context.internalAdapter.countTotalUsers();
						return ctx.json({
							users: users as UserWithRole[],
							total: total,
							limit: Number(ctx.query?.limit) || undefined,
							offset: Number(ctx.query?.offset) || undefined,
						});
					} catch (e) {
						return ctx.json({
							users: [],
							total: 0,
						});
					}
				},
			),
			listUserSessions: createAuthEndpoint(
				"/admin/list-user-sessions",
				{
					method: "POST",
					use: [adminMiddleware],
					body: z.object({
						userId: z.string({
							description: "The user id",
						}),
					}),
					metadata: {
						openapi: {
							operationId: "listUserSessions",
							summary: "List user sessions",
							description: "List user sessions",
							responses: {
								200: {
									description: "List of user sessions",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													sessions: {
														type: "array",
														items: {
															$ref: "#/components/schemas/Session",
														},
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
				async (ctx) => {
					const sessions = await ctx.context.internalAdapter.listSessions(
						ctx.body.userId,
					);
					return {
						sessions: sessions,
					};
				},
			),
			unbanUser: createAuthEndpoint(
				"/admin/unban-user",
				{
					method: "POST",
					body: z.object({
						userId: z.string({
							description: "The user id",
						}),
					}),
					use: [adminMiddleware],
					metadata: {
						openapi: {
							operationId: "unbanUser",
							summary: "Unban a user",
							description: "Unban a user",
							responses: {
								200: {
									description: "User unbanned",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													user: {
														$ref: "#/components/schemas/User",
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
				async (ctx) => {
					const user = await ctx.context.internalAdapter.updateUser(
						ctx.body.userId,
						{
							banned: false,
						},
					);
					return ctx.json({
						user: user,
					});
				},
			),
			banUser: createAuthEndpoint(
				"/admin/ban-user",
				{
					method: "POST",
					body: z.object({
						userId: z.string({
							description: "The user id",
						}),
						/**
						 * Reason for the ban
						 */
						banReason: z
							.string({
								description: "The reason for the ban",
							})
							.optional(),
						/**
						 * Number of seconds until the ban expires
						 */
						banExpiresIn: z
							.number({
								description: "The number of seconds until the ban expires",
							})
							.optional(),
					}),
					use: [adminMiddleware],
					metadata: {
						openapi: {
							operationId: "banUser",
							summary: "Ban a user",
							description: "Ban a user",
							responses: {
								200: {
									description: "User banned",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													user: {
														$ref: "#/components/schemas/User",
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
				async (ctx) => {
					if (ctx.body.userId === ctx.context.session.user.id) {
						throw new APIError("BAD_REQUEST", {
							message: ERROR_CODES.YOU_CANNOT_BAN_YOURSELF,
						});
					}
					const user = await ctx.context.internalAdapter.updateUser(
						ctx.body.userId,
						{
							banned: true,
							banReason:
								ctx.body.banReason || options?.defaultBanReason || "No reason",
							banExpires: ctx.body.banExpiresIn
								? getDate(ctx.body.banExpiresIn, "sec")
								: options?.defaultBanExpiresIn
									? getDate(options.defaultBanExpiresIn, "sec")
									: undefined,
						},
					);
					//revoke all sessions
					await ctx.context.internalAdapter.deleteSessions(ctx.body.userId);
					return ctx.json({
						user: user,
					});
				},
			),
			impersonateUser: createAuthEndpoint(
				"/admin/impersonate-user",
				{
					method: "POST",
					body: z.object({
						userId: z.string({
							description: "The user id",
						}),
					}),
					use: [adminMiddleware],
					metadata: {
						openapi: {
							operationId: "impersonateUser",
							summary: "Impersonate a user",
							description: "Impersonate a user",
							responses: {
								200: {
									description: "Impersonation session created",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													session: {
														$ref: "#/components/schemas/Session",
													},
													user: {
														$ref: "#/components/schemas/User",
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
				async (ctx) => {
					const targetUser = await ctx.context.internalAdapter.findUserById(
						ctx.body.userId,
					);

					if (!targetUser) {
						throw new APIError("NOT_FOUND", {
							message: "User not found",
						});
					}

					const session = await ctx.context.internalAdapter.createSession(
						targetUser.id,
						undefined,
						true,
						{
							impersonatedBy: ctx.context.session.user.id,
							expiresAt: options?.impersonationSessionDuration
								? getDate(options.impersonationSessionDuration, "sec")
								: getDate(60 * 60, "sec"), // 1 hour
						},
					);
					if (!session) {
						throw new APIError("INTERNAL_SERVER_ERROR", {
							message: ERROR_CODES.FAILED_TO_CREATE_USER,
						});
					}
					const authCookies = ctx.context.authCookies;
					deleteSessionCookie(ctx);
					await ctx.setSignedCookie(
						"admin_session",
						ctx.context.session.session.token,
						ctx.context.secret,
						authCookies.sessionToken.options,
					);
					await setSessionCookie(
						ctx,
						{
							session: session,
							user: targetUser,
						},
						true,
					);
					return ctx.json({
						session: session,
						user: targetUser,
					});
				},
			),
			stopImpersonating: createAuthEndpoint(
				"/admin/stop-impersonating",
				{
					method: "POST",
				},
				async (ctx) => {
					const session = await getSessionFromCtx<
						{},
						{
							impersonatedBy: string;
						}
					>(ctx);
					if (!session) {
						throw new APIError("UNAUTHORIZED");
					}
					if (!session.session.impersonatedBy) {
						throw new APIError("BAD_REQUEST", {
							message: "You are not impersonating anyone",
						});
					}
					const user = await ctx.context.internalAdapter.findUserById(
						session.session.impersonatedBy,
					);
					if (!user) {
						throw new APIError("INTERNAL_SERVER_ERROR", {
							message: "Failed to find user",
						});
					}
					const adminCookie = await ctx.getSignedCookie(
						"admin_session",
						ctx.context.secret,
					);
					if (!adminCookie) {
						throw new APIError("INTERNAL_SERVER_ERROR", {
							message: "Failed to find admin session",
						});
					}
					const adminSession =
						await ctx.context.internalAdapter.findSession(adminCookie);
					if (!adminSession || adminSession.session.userId !== user.id) {
						throw new APIError("INTERNAL_SERVER_ERROR", {
							message: "Failed to find admin session",
						});
					}
					await setSessionCookie(ctx, adminSession);
					return ctx.json(adminSession);
				},
			),
			revokeUserSession: createAuthEndpoint(
				"/admin/revoke-user-session",
				{
					method: "POST",
					body: z.object({
						sessionToken: z.string({
							description: "The session token",
						}),
					}),
					use: [adminMiddleware],
					metadata: {
						openapi: {
							operationId: "revokeUserSession",
							summary: "Revoke a user session",
							description: "Revoke a user session",
							responses: {
								200: {
									description: "Session revoked",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													success: {
														type: "boolean",
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
				async (ctx) => {
					await ctx.context.internalAdapter.deleteSession(
						ctx.body.sessionToken,
					);
					return ctx.json({
						success: true,
					});
				},
			),
			revokeUserSessions: createAuthEndpoint(
				"/admin/revoke-user-sessions",
				{
					method: "POST",
					body: z.object({
						userId: z.string({
							description: "The user id",
						}),
					}),
					use: [adminMiddleware],
					metadata: {
						openapi: {
							operationId: "revokeUserSessions",
							summary: "Revoke all user sessions",
							description: "Revoke all user sessions",
							responses: {
								200: {
									description: "Sessions revoked",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													success: {
														type: "boolean",
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
				async (ctx) => {
					await ctx.context.internalAdapter.deleteSessions(ctx.body.userId);
					return ctx.json({
						success: true,
					});
				},
			),
			removeUser: createAuthEndpoint(
				"/admin/remove-user",
				{
					method: "POST",
					body: z.object({
						userId: z.string({
							description: "The user id",
						}),
					}),
					use: [adminMiddleware],
					metadata: {
						openapi: {
							operationId: "removeUser",
							summary: "Remove a user",
							description:
								"Delete a user and all their sessions and accounts. Cannot be undone.",
							responses: {
								200: {
									description: "User removed",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													success: {
														type: "boolean",
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
				async (ctx) => {
					await ctx.context.internalAdapter.deleteUser(ctx.body.userId);
					return ctx.json({
						success: true,
					});
				},
			),
		},
		$ERROR_CODES: ERROR_CODES,
		schema: mergeSchema(schema, opts.schema),
	} satisfies BetterAuthPlugin;
};

const schema = {
	user: {
		fields: {
			role: {
				type: "string",
				required: false,
				input: false,
			},
			banned: {
				type: "boolean",
				defaultValue: false,
				required: false,
				input: false,
			},
			banReason: {
				type: "string",
				required: false,
				input: false,
			},
			banExpires: {
				type: "date",
				required: false,
				input: false,
			},
		},
	},
	session: {
		fields: {
			impersonatedBy: {
				type: "string",
				required: false,
			},
		},
	},
} satisfies AuthPluginSchema;
