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
import { type AccessControl, type Role } from "../access";
import { ADMIN_ERROR_CODES } from "./error-codes";
import { defaultStatements } from "./access";
import { hasPermission } from "./has-permission";

export interface UserWithRole extends User {
	role?: string;
	banned?: boolean | null;
	banReason?: string | null;
	banExpires?: Date | null;
}

export interface SessionWithImpersonatedBy extends Session {
	impersonatedBy?: string;
}

export interface AdminOptions {
	/**
	 * The default role for a user
	 *
	 * @default "user"
	 */
	defaultRole?: string;
	/**
	 * Roles that are considered admin roles.
	 *
	 * Any user role that isn't in this list, even if they have the permission,
	 * will not be considered an admin.
	 *
	 * @default ["admin"]
	 */
	adminRoles?: string | string[];
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
	/**
	 * Configure the roles and permissions for the admin
	 * plugin.
	 */
	ac?: AccessControl;
	/**
	 * Custom permissions for roles.
	 */
	roles?: {
		[key in string]?: Role;
	};
	/**
	 * List of user ids that should have admin access
	 *
	 * If this is set, the `adminRole` option is ignored
	 */
	adminUserIds?: string[];
	/**
	 * Message to show when a user is banned
	 *
	 * By default, the message is "You have been banned from this application"
	 */
	bannedUserMessage?: string;
}

export type InferAdminRolesFromOption<O extends AdminOptions | undefined> =
	O extends { roles: Record<string, unknown> }
		? keyof O["roles"]
		: "user" | "admin";

function parseRoles(roles: string | string[]): string {
	return Array.isArray(roles) ? roles.join(",") : roles;
}

export const admin = <O extends AdminOptions>(options?: O) => {
	const opts = {
		defaultRole: options?.defaultRole ?? "user",
		adminRoles: options?.adminRoles ?? ["admin"],
		bannedUserMessage:
			options?.bannedUserMessage ??
			"You have been banned from this application. Please contact support if you believe this is an error.",
		...options,
	};
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

	const adminMiddleware = createAuthMiddleware(async (ctx) => {
		const session = await getSessionFromCtx(ctx);
		if (!session) {
			throw new APIError("UNAUTHORIZED");
		}
		return {
			session,
		} as {
			session: {
				user: UserWithRole;
				session: Session;
			};
		};
	});

	return {
		id: "admin",
		init() {
			return {
				options: {
					databaseHooks: {
						user: {
							create: {
								async before(user) {
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
								async before(session, ctx) {
									if (!ctx) {
										return;
									}
									const user = (await ctx.context.internalAdapter.findUserById(
										session.userId,
									)) as UserWithRole;

									if (user.banned) {
										if (
											user.banExpires &&
											user.banExpires.getTime() < Date.now()
										) {
											await ctx.context.internalAdapter.updateUser(
												session.userId,
												{
													banned: false,
													banReason: null,
													banExpires: null,
												},
											);
											return;
										}

										if (
											ctx &&
											(ctx.path.startsWith("/callback") ||
												ctx.path.startsWith("/oauth2/callback"))
										) {
											const redirectURI =
												ctx.context.options.onAPIError?.errorURL ||
												`${ctx.context.baseURL}/error`;
											throw ctx.redirect(
												`${redirectURI}?error=banned&error_description=${opts.bannedUserMessage}`,
											);
										}

										throw new APIError("FORBIDDEN", {
											message: opts.bannedUserMessage,
											code: "BANNED_USER",
										});
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
						userId: z.coerce.string({
							description: "The user id",
						}),
						role: z.union([
							z.string({
								description: "The role to set. `admin` or `user` by default",
							}),
							z.array(
								z.string({
									description: "The roles to set. `admin` or `user` by default",
								}),
							),
						]),
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
						$Infer: {
							body: {} as {
								userId: string;
								role:
									| InferAdminRolesFromOption<O>
									| InferAdminRolesFromOption<O>[];
							},
						},
					},
				},
				async (ctx) => {
					const canSetRole = hasPermission({
						userId: ctx.context.session.user.id,
						role: ctx.context.session.user.role,
						options: opts,
						permissions: {
							user: ["set-role"],
						},
					});
					if (!canSetRole) {
						throw new APIError("FORBIDDEN", {
							message:
								ADMIN_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE,
						});
					}

					const updatedUser = await ctx.context.internalAdapter.updateUser(
						ctx.body.userId,
						{
							role: parseRoles(ctx.body.role),
						},
						ctx,
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
						role: z
							.union([
								z.string({
									description: "The role of the user",
								}),
								z.array(
									z.string({
										description: "The roles of user",
									}),
								),
							])
							.optional(),
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
						$Infer: {
							body: {} as {
								email: string;
								password: string;
								name: string;
								role?:
									| InferAdminRolesFromOption<O>
									| InferAdminRolesFromOption<O>[];
								data?: Record<string, any>;
							},
						},
					},
				},
				async (ctx) => {
					const session = await getSessionFromCtx<{ role: string }>(ctx);
					if (!session && (ctx.request || ctx.headers)) {
						throw ctx.error("UNAUTHORIZED");
					}
					if (session) {
						const canCreateUser = hasPermission({
							userId: session.user.id,
							role: session.user.role,
							options: opts,
							permissions: {
								user: ["create"],
							},
						});
						if (!canCreateUser) {
							throw new APIError("FORBIDDEN", {
								message: ADMIN_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS,
							});
						}
					}
					const existUser = await ctx.context.internalAdapter.findUserByEmail(
						ctx.body.email,
					);
					if (existUser) {
						throw new APIError("BAD_REQUEST", {
							message: ADMIN_ERROR_CODES.USER_ALREADY_EXISTS,
						});
					}
					const user =
						await ctx.context.internalAdapter.createUser<UserWithRole>({
							email: ctx.body.email,
							name: ctx.body.name,
							role:
								(ctx.body.role && parseRoles(ctx.body.role)) ??
								options?.defaultRole ??
								"user",
							...ctx.body.data,
						});

					if (!user) {
						throw new APIError("INTERNAL_SERVER_ERROR", {
							message: ADMIN_ERROR_CODES.FAILED_TO_CREATE_USER,
						});
					}
					const hashedPassword = await ctx.context.password.hash(
						ctx.body.password,
					);
					await ctx.context.internalAdapter.linkAccount(
						{
							accountId: user.id,
							providerId: "credential",
							password: hashedPassword,
							userId: user.id,
						},
						ctx,
					);
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
														type: "number",
													},
													offset: {
														type: "number",
													},
												},
												required: ["users", "total"],
											},
										},
									},
								},
							},
						},
					},
				},
				async (ctx) => {
					const session = ctx.context.session;
					const canListUsers = hasPermission({
						userId: ctx.context.session.user.id,
						role: session.user.role,
						options: opts,
						permissions: {
							user: ["list"],
						},
					});
					if (!canListUsers) {
						throw new APIError("FORBIDDEN", {
							message: ADMIN_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_LIST_USERS,
						});
					}

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
						const total = await ctx.context.internalAdapter.countTotalUsers(
							where.length ? where : undefined,
						);
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
						userId: z.coerce.string({
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
					const session = ctx.context.session;
					const canListSessions = hasPermission({
						userId: ctx.context.session.user.id,
						role: session.user.role,
						options: opts,
						permissions: {
							session: ["list"],
						},
					});
					if (!canListSessions) {
						throw new APIError("FORBIDDEN", {
							message:
								ADMIN_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS,
						});
					}

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
						userId: z.coerce.string({
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
					const session = ctx.context.session;
					const canBanUser = hasPermission({
						userId: ctx.context.session.user.id,
						role: session.user.role,
						options: opts,
						permissions: {
							user: ["ban"],
						},
					});
					if (!canBanUser) {
						throw new APIError("FORBIDDEN", {
							message: ADMIN_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_BAN_USERS,
						});
					}

					const user = await ctx.context.internalAdapter.updateUser(
						ctx.body.userId,
						{
							banned: false,
							banExpires: null,
							banReason: null,
							updatedAt: new Date(),
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
						userId: z.coerce.string({
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
					const session = ctx.context.session;
					const canBanUser = hasPermission({
						userId: ctx.context.session.user.id,
						role: session.user.role,
						options: opts,
						permissions: {
							user: ["ban"],
						},
					});
					if (!canBanUser) {
						throw new APIError("FORBIDDEN", {
							message: ADMIN_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_BAN_USERS,
						});
					}

					if (ctx.body.userId === ctx.context.session.user.id) {
						throw new APIError("BAD_REQUEST", {
							message: ADMIN_ERROR_CODES.YOU_CANNOT_BAN_YOURSELF,
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
							updatedAt: new Date(),
						},
						ctx,
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
						userId: z.coerce.string({
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
					const canImpersonateUser = hasPermission({
						userId: ctx.context.session.user.id,
						role: ctx.context.session.user.role,
						options: opts,
						permissions: {
							user: ["impersonate"],
						},
					});
					if (!canImpersonateUser) {
						throw new APIError("FORBIDDEN", {
							message:
								ADMIN_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS,
						});
					}

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
						ctx,
						true,
						{
							impersonatedBy: ctx.context.session.user.id,
							expiresAt: options?.impersonationSessionDuration
								? getDate(options.impersonationSessionDuration, "sec")
								: getDate(60 * 60, "sec"), // 1 hour
						},
						true,
					);
					if (!session) {
						throw new APIError("INTERNAL_SERVER_ERROR", {
							message: ADMIN_ERROR_CODES.FAILED_TO_CREATE_USER,
						});
					}
					const authCookies = ctx.context.authCookies;
					deleteSessionCookie(ctx);
					const dontRememberMeCookie = await ctx.getSignedCookie(
						ctx.context.authCookies.dontRememberToken.name,
						ctx.context.secret,
					);
					const adminCookieProp = ctx.context.createAuthCookie("admin_session");
					await ctx.setSignedCookie(
						adminCookieProp.name,
						`${ctx.context.session.session.token}:${
							dontRememberMeCookie || ""
						}`,
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
					const adminCookieName =
						ctx.context.createAuthCookie("admin_session").name;
					const adminCookie = await ctx.getSignedCookie(
						adminCookieName,
						ctx.context.secret,
					);

					if (!adminCookie) {
						throw new APIError("INTERNAL_SERVER_ERROR", {
							message: "Failed to find admin session",
						});
					}
					const [adminSessionToken, dontRememberMeCookie] =
						adminCookie?.split(":");
					const adminSession =
						await ctx.context.internalAdapter.findSession(adminSessionToken);
					if (!adminSession || adminSession.session.userId !== user.id) {
						throw new APIError("INTERNAL_SERVER_ERROR", {
							message: "Failed to find admin session",
						});
					}
					await ctx.context.internalAdapter.deleteSession(
						session.session.token,
					);
					await setSessionCookie(ctx, adminSession, !!dontRememberMeCookie);
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
					const session = ctx.context.session;
					const canRevokeSession = hasPermission({
						userId: ctx.context.session.user.id,
						role: session.user.role,
						options: opts,
						permissions: {
							session: ["revoke"],
						},
					});
					if (!canRevokeSession) {
						throw new APIError("FORBIDDEN", {
							message:
								ADMIN_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS,
						});
					}

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
						userId: z.coerce.string({
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
					const session = ctx.context.session;
					const canRevokeSession = hasPermission({
						userId: ctx.context.session.user.id,
						role: session.user.role,
						options: opts,
						permissions: {
							session: ["revoke"],
						},
					});
					if (!canRevokeSession) {
						throw new APIError("FORBIDDEN", {
							message:
								ADMIN_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS,
						});
					}

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
						userId: z.coerce.string({
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
					const session = ctx.context.session;
					const canDeleteUser = hasPermission({
						userId: ctx.context.session.user.id,
						role: session.user.role,
						options: opts,
						permissions: {
							user: ["delete"],
						},
					});
					if (!canDeleteUser) {
						throw new APIError("FORBIDDEN", {
							message: ADMIN_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS,
						});
					}
					await ctx.context.internalAdapter.deleteUser(ctx.body.userId);
					return ctx.json({
						success: true,
					});
				},
			),
			setUserPassword: createAuthEndpoint(
				"/admin/set-user-password",
				{
					method: "POST",
					body: z.object({
						newPassword: z.string({
							description: "The new password",
						}),
						userId: z.coerce.string({
							description: "The user id",
						}),
					}),
					use: [adminMiddleware],
					metadata: {
						openapi: {
							operationId: "setUserPassword",
							summary: "Set a user's password",
							description: "Set a user's password",
							responses: {
								200: {
									description: "Password set",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													status: {
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
					const canSetUserPassword = hasPermission({
						userId: ctx.context.session.user.id,
						role: ctx.context.session.user.role,
						options: opts,
						permissions: {
							user: ["set-password"],
						},
					});
					if (!canSetUserPassword) {
						throw new APIError("FORBIDDEN", {
							message:
								ADMIN_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD,
						});
					}
					const hashedPassword = await ctx.context.password.hash(
						ctx.body.newPassword,
					);
					await ctx.context.internalAdapter.updatePassword(
						ctx.body.userId,
						hashedPassword,
					);
					return ctx.json({
						status: true,
					});
				},
			),
			userHasPermission: createAuthEndpoint(
				"/admin/has-permission",
				{
					method: "POST",
					body: z
						.object({
							userId: z.coerce.string().optional(),
							role: z.string().optional(),
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
						$Infer: {
							body: {} as PermissionExclusive & {
								userId?: string;
								role?: InferAdminRolesFromOption<O>;
							},
						},
					},
				},
				async (ctx) => {
					if (!ctx.body?.permission && !ctx.body?.permissions) {
						throw new APIError("BAD_REQUEST", {
							message:
								"invalid permission check. no permission(s) were passed.",
						});
					}
					const session = await getSessionFromCtx(ctx);

					if (
						!session &&
						(ctx.request || ctx.headers) &&
						!ctx.body.userId &&
						!ctx.body.role
					) {
						throw new APIError("UNAUTHORIZED");
					}
					const user =
						session?.user ||
						((await ctx.context.internalAdapter.findUserById(
							ctx.body.userId as string,
						)) as { role?: string; id: string }) ||
						(ctx.body.role ? { id: "", role: ctx.body.role } : null);
					if (!user) {
						throw new APIError("BAD_REQUEST", {
							message: "user not found",
						});
					}
					const result = hasPermission({
						userId: user.id,
						role: user.role,
						options: options as AdminOptions,
						permissions: (ctx.body.permissions ?? ctx.body.permission) as any,
					});
					return ctx.json({
						error: null,
						success: result,
					});
				},
			),
		},
		$ERROR_CODES: ADMIN_ERROR_CODES,
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
