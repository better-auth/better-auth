import {
	createAuthEndpoint,
	createAuthMiddleware,
} from "@better-auth/core/api";
import type { Session } from "@better-auth/core/db";
import type { Where } from "@better-auth/core/db/adapter";
import { BASE_ERROR_CODES } from "@better-auth/core/error";
import * as z from "zod";
import { APIError, getSessionFromCtx } from "../../api";
import { deleteSessionCookie, setSessionCookie } from "../../cookies";
import { parseUserOutput } from "../../db/schema";
import { getDate } from "../../utils/date";
import type { AccessControl } from "../access";
import type { defaultStatements } from "./access";
import { ADMIN_ERROR_CODES } from "./error-codes";
import { hasPermission } from "./has-permission";
import type {
	AdminOptions,
	InferAdminRolesFromOption,
	SessionWithImpersonatedBy,
	UserWithRole,
} from "./types";

/**
 * Ensures a valid session, if not will throw.
 * Will also provide additional types on the user to include role types.
 */
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

function parseRoles(roles: string | string[]): string {
	return Array.isArray(roles) ? roles.join(",") : roles;
}

const setRoleBodySchema = z.object({
	userId: z.coerce.string().meta({
		description: "The user id",
	}),
	role: z
		.union([
			z.string().meta({
				description: "The role to set. `admin` or `user` by default",
			}),
			z.array(
				z.string().meta({
					description: "The roles to set. `admin` or `user` by default",
				}),
			),
		])
		.meta({
			description:
				"The role to set, this can be a string or an array of strings. Eg: `admin` or `[admin, user]`",
		}),
});

/**
 * ### Endpoint
 *
 * POST `/admin/set-role`
 *
 * ### API Methods
 *
 * **server:**
 * `auth.api.setRole`
 *
 * **client:**
 * `authClient.admin.setRole`
 *
 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/admin#api-method-admin-set-role)
 */
export const setRole = <O extends AdminOptions>(opts: O) =>
	createAuthEndpoint(
		"/admin/set-role",
		{
			method: "POST",
			body: setRoleBodySchema,
			requireHeaders: true,
			use: [adminMiddleware],
			metadata: {
				openapi: {
					operationId: "setUserRole",
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
						role: InferAdminRolesFromOption<O> | InferAdminRolesFromOption<O>[];
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
					message: ADMIN_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE,
				});
			}
			const roles = opts.roles;
			if (roles) {
				const inputRoles = Array.isArray(ctx.body.role)
					? ctx.body.role
					: [ctx.body.role];
				for (const role of inputRoles) {
					if (!roles[role as keyof typeof roles]) {
						throw new APIError("BAD_REQUEST", {
							message:
								ADMIN_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE,
						});
					}
				}
			}
			const updatedUser = await ctx.context.internalAdapter.updateUser(
				ctx.body.userId,
				{
					role: parseRoles(ctx.body.role),
				},
			);
			return ctx.json({
				user: updatedUser as UserWithRole,
			});
		},
	);

const getUserQuerySchema = z.object({
	id: z.string().meta({
		description: "The id of the User",
	}),
});

export const getUser = (opts: AdminOptions) =>
	createAuthEndpoint(
		"/admin/get-user",
		{
			method: "GET",
			query: getUserQuerySchema,
			use: [adminMiddleware],
			metadata: {
				openapi: {
					operationId: "getUser",
					summary: "Get an existing user",
					description: "Get an existing user",
					responses: {
						200: {
							description: "User",
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
			const { id } = ctx.query;

			const canGetUser = hasPermission({
				userId: ctx.context.session.user.id,
				role: ctx.context.session.user.role,
				options: opts,
				permissions: {
					user: ["get"],
				},
			});

			if (!canGetUser) {
				throw ctx.error("FORBIDDEN", {
					message: ADMIN_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_GET_USER,
					code: "YOU_ARE_NOT_ALLOWED_TO_GET_USER",
				});
			}

			const user = await ctx.context.internalAdapter.findUserById(id);

			if (!user) {
				throw new APIError("NOT_FOUND", {
					message: BASE_ERROR_CODES.USER_NOT_FOUND,
				});
			}

			return parseUserOutput(ctx.context.options, user);
		},
	);

const createUserBodySchema = z.object({
	email: z.string().meta({
		description: "The email of the user",
	}),
	password: z.string().meta({
		description: "The password of the user",
	}),
	name: z.string().meta({
		description: "The name of the user",
	}),
	role: z
		.union([
			z.string().meta({
				description: "The role of the user",
			}),
			z.array(
				z.string().meta({
					description: "The roles of user",
				}),
			),
		])
		.optional()
		.meta({
			description: `A string or array of strings representing the roles to apply to the new user. Eg: \"user\"`,
		}),
	/**
	 * extra fields for user
	 */
	data: z.record(z.string(), z.any()).optional().meta({
		description:
			"Extra fields for the user. Including custom additional fields.",
	}),
});

/**
 * ### Endpoint
 *
 * POST `/admin/create-user`
 *
 * ### API Methods
 *
 * **server:**
 * `auth.api.createUser`
 *
 * **client:**
 * `authClient.admin.createUser`
 *
 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/admin#api-method-admin-create-user)
 */
export const createUser = <O extends AdminOptions>(opts: O) =>
	createAuthEndpoint(
		"/admin/create-user",
		{
			method: "POST",
			body: createUserBodySchema,
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
							| (InferAdminRolesFromOption<O> | InferAdminRolesFromOption<O>[])
							| undefined;
						data?: Record<string, any> | undefined;
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

			const email = ctx.body.email.toLowerCase();
			const isValidEmail = z.email().safeParse(email);
			if (!isValidEmail.success) {
				throw new APIError("BAD_REQUEST", {
					message: BASE_ERROR_CODES.INVALID_EMAIL,
				});
			}

			const existUser =
				await ctx.context.internalAdapter.findUserByEmail(email);
			if (existUser) {
				throw new APIError("BAD_REQUEST", {
					message: ADMIN_ERROR_CODES.USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL,
				});
			}
			const user = await ctx.context.internalAdapter.createUser<UserWithRole>({
				email: email,
				name: ctx.body.name,
				role:
					(ctx.body.role && parseRoles(ctx.body.role)) ??
					opts?.defaultRole ??
					"user",
				...ctx.body.data,
			});

			if (!user) {
				throw new APIError("INTERNAL_SERVER_ERROR", {
					message: ADMIN_ERROR_CODES.FAILED_TO_CREATE_USER,
				});
			}
			const hashedPassword = await ctx.context.password.hash(ctx.body.password);
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
	);

const adminUpdateUserBodySchema = z.object({
	userId: z.coerce.string().meta({
		description: "The user id",
	}),
	data: z.record(z.any(), z.any()).meta({
		description: "The user data to update",
	}),
});

/**
 * ### Endpoint
 *
 * POST `/admin/update-user`
 *
 * ### API Methods
 *
 * **server:**
 * `auth.api.adminUpdateUser`
 *
 * **client:**
 * `authClient.admin.updateUser`
 *
 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/admin#api-method-admin-update-user)
 */
export const adminUpdateUser = (opts: AdminOptions) =>
	createAuthEndpoint(
		"/admin/update-user",
		{
			method: "POST",
			body: adminUpdateUserBodySchema,
			use: [adminMiddleware],
			metadata: {
				openapi: {
					operationId: "updateUser",
					summary: "Update a user",
					description: "Update a user's details",
					responses: {
						200: {
							description: "User updated",
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
			const canUpdateUser = hasPermission({
				userId: ctx.context.session.user.id,
				role: ctx.context.session.user.role,
				options: opts,
				permissions: {
					user: ["update"],
				},
			});
			if (!canUpdateUser) {
				throw ctx.error("FORBIDDEN", {
					message: ADMIN_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS,
					code: "YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS",
				});
			}

			if (Object.keys(ctx.body.data).length === 0) {
				throw new APIError("BAD_REQUEST", {
					message: ADMIN_ERROR_CODES.NO_DATA_TO_UPDATE,
				});
			}
			if (ctx.body.data?.role) {
				ctx.body.data.role = parseRoles(ctx.body.data.role);
			}
			const updatedUser = await ctx.context.internalAdapter.updateUser(
				ctx.body.userId,
				ctx.body.data,
			);

			return ctx.json(updatedUser as UserWithRole);
		},
	);

const listUsersQuerySchema = z.object({
	searchValue: z.string().optional().meta({
		description: 'The value to search for. Eg: "some name"',
	}),
	searchField: z
		.enum(["email", "name"])
		.meta({
			description:
				'The field to search in, defaults to email. Can be `email` or `name`. Eg: "name"',
		})
		.optional(),
	searchOperator: z
		.enum(["contains", "starts_with", "ends_with"])
		.meta({
			description:
				'The operator to use for the search. Can be `contains`, `starts_with` or `ends_with`. Eg: "contains"',
		})
		.optional(),
	limit: z
		.string()
		.meta({
			description: "The number of users to return",
		})
		.or(z.number())
		.optional(),
	offset: z
		.string()
		.meta({
			description: "The offset to start from",
		})
		.or(z.number())
		.optional(),
	sortBy: z
		.string()
		.meta({
			description: "The field to sort by",
		})
		.optional(),
	sortDirection: z
		.enum(["asc", "desc"])
		.meta({
			description: "The direction to sort by",
		})
		.optional(),
	filterField: z
		.string()
		.meta({
			description: "The field to filter by",
		})
		.optional(),
	filterValue: z
		.string()
		.meta({
			description: "The value to filter by",
		})
		.or(z.number())
		.or(z.boolean())
		.optional(),
	filterOperator: z
		.enum(["eq", "ne", "lt", "lte", "gt", "gte", "contains"])
		.meta({
			description: "The operator to use for the filter",
		})
		.optional(),
});

export const listUsers = (opts: AdminOptions) =>
	createAuthEndpoint(
		"/admin/list-users",
		{
			method: "GET",
			use: [adminMiddleware],
			query: listUsersQuerySchema,
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
	);

const listUserSessionsBodySchema = z.object({
	userId: z.coerce.string().meta({
		description: "The user id",
	}),
});

/**
 * ### Endpoint
 *
 * POST `/admin/list-user-sessions`
 *
 * ### API Methods
 *
 * **server:**
 * `auth.api.listUserSessions`
 *
 * **client:**
 * `authClient.admin.listUserSessions`
 *
 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/admin#api-method-admin-list-user-sessions)
 */
export const listUserSessions = (opts: AdminOptions) =>
	createAuthEndpoint(
		"/admin/list-user-sessions",
		{
			method: "POST",
			use: [adminMiddleware],
			body: listUserSessionsBodySchema,
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
					message: ADMIN_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS,
				});
			}

			const sessions: SessionWithImpersonatedBy[] =
				await ctx.context.internalAdapter.listSessions(ctx.body.userId);
			return {
				sessions: sessions,
			};
		},
	);

const unbanUserBodySchema = z.object({
	userId: z.coerce.string().meta({
		description: "The user id",
	}),
});

/**
 * ### Endpoint
 *
 * POST `/admin/unban-user`
 *
 * ### API Methods
 *
 * **server:**
 * `auth.api.unbanUser`
 *
 * **client:**
 * `authClient.admin.unbanUser`
 *
 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/admin#api-method-admin-unban-user)
 */
export const unbanUser = (opts: AdminOptions) =>
	createAuthEndpoint(
		"/admin/unban-user",
		{
			method: "POST",
			body: unbanUserBodySchema,
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
	);

const banUserBodySchema = z.object({
	userId: z.coerce.string().meta({
		description: "The user id",
	}),
	/**
	 * Reason for the ban
	 */
	banReason: z
		.string()
		.meta({
			description: "The reason for the ban",
		})
		.optional(),
	/**
	 * Number of seconds until the ban expires
	 */
	banExpiresIn: z
		.number()
		.meta({
			description: "The number of seconds until the ban expires",
		})
		.optional(),
});

/**
 * ### Endpoint
 *
 * POST `/admin/ban-user`
 *
 * ### API Methods
 *
 * **server:**
 * `auth.api.banUser`
 *
 * **client:**
 * `authClient.admin.banUser`
 *
 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/admin#api-method-admin-ban-user)
 */
export const banUser = (opts: AdminOptions) =>
	createAuthEndpoint(
		"/admin/ban-user",
		{
			method: "POST",
			body: banUserBodySchema,
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

			const foundUser = await ctx.context.internalAdapter.findUserById(
				ctx.body.userId,
			);

			if (!foundUser) {
				throw new APIError("NOT_FOUND", {
					message: BASE_ERROR_CODES.USER_NOT_FOUND,
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
						ctx.body.banReason || opts?.defaultBanReason || "No reason",
					banExpires: ctx.body.banExpiresIn
						? getDate(ctx.body.banExpiresIn, "sec")
						: opts?.defaultBanExpiresIn
							? getDate(opts.defaultBanExpiresIn, "sec")
							: undefined,
					updatedAt: new Date(),
				},
			);
			//revoke all sessions
			await ctx.context.internalAdapter.deleteSessions(ctx.body.userId);
			return ctx.json({
				user: user,
			});
		},
	);

const impersonateUserBodySchema = z.object({
	userId: z.coerce.string().meta({
		description: "The user id",
	}),
});
/**
 * ### Endpoint
 *
 * POST `/admin/impersonate-user`
 *
 * ### API Methods
 *
 * **server:**
 * `auth.api.impersonateUser`
 *
 * **client:**
 * `authClient.admin.impersonateUser`
 *
 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/admin#api-method-admin-impersonate-user)
 */
export const impersonateUser = (opts: AdminOptions) =>
	createAuthEndpoint(
		"/admin/impersonate-user",
		{
			method: "POST",
			body: impersonateUserBodySchema,
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
					message: ADMIN_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS,
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
				true,
				{
					impersonatedBy: ctx.context.session.user.id,
					expiresAt: opts?.impersonationSessionDuration
						? getDate(opts.impersonationSessionDuration, "sec")
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
				`${ctx.context.session.session.token}:${dontRememberMeCookie || ""}`,
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
	);

/**
 * ### Endpoint
 *
 * POST `/admin/stop-impersonating`
 *
 * ### API Methods
 *
 * **server:**
 * `auth.api.stopImpersonating`
 *
 * **client:**
 * `authClient.admin.stopImpersonating`
 *
 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/admin#api-method-admin-stop-impersonating)
 */
export const stopImpersonating = () =>
	createAuthEndpoint(
		"/admin/stop-impersonating",
		{
			method: "POST",
			requireHeaders: true,
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
			const [adminSessionToken, dontRememberMeCookie] = adminCookie?.split(":");
			const adminSession = await ctx.context.internalAdapter.findSession(
				adminSessionToken!,
			);
			if (!adminSession || adminSession.session.userId !== user.id) {
				throw new APIError("INTERNAL_SERVER_ERROR", {
					message: "Failed to find admin session",
				});
			}
			await ctx.context.internalAdapter.deleteSession(session.session.token);
			await setSessionCookie(ctx, adminSession, !!dontRememberMeCookie);
			await ctx.setSignedCookie(adminCookieName, "", ctx.context.secret, {
				...ctx.context.authCookies.sessionToken.options,
				maxAge: 0,
			});
			return ctx.json(adminSession);
		},
	);

const revokeUserSessionBodySchema = z.object({
	sessionToken: z.string().meta({
		description: "The session token",
	}),
});
/**
 * ### Endpoint
 *
 * POST `/admin/revoke-user-session`
 *
 * ### API Methods
 *
 * **server:**
 * `auth.api.revokeUserSession`
 *
 * **client:**
 * `authClient.admin.revokeUserSession`
 *
 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/admin#api-method-admin-revoke-user-session)
 */
export const revokeUserSession = (opts: AdminOptions) =>
	createAuthEndpoint(
		"/admin/revoke-user-session",
		{
			method: "POST",
			body: revokeUserSessionBodySchema,
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

			await ctx.context.internalAdapter.deleteSession(ctx.body.sessionToken);
			return ctx.json({
				success: true,
			});
		},
	);

const revokeUserSessionsBodySchema = z.object({
	userId: z.coerce.string().meta({
		description: "The user id",
	}),
});
/**
 * ### Endpoint
 *
 * POST `/admin/revoke-user-sessions`
 *
 * ### API Methods
 *
 * **server:**
 * `auth.api.revokeUserSessions`
 *
 * **client:**
 * `authClient.admin.revokeUserSessions`
 *
 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/admin#api-method-admin-revoke-user-sessions)
 */
export const revokeUserSessions = (opts: AdminOptions) =>
	createAuthEndpoint(
		"/admin/revoke-user-sessions",
		{
			method: "POST",
			body: revokeUserSessionsBodySchema,
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
	);

const removeUserBodySchema = z.object({
	userId: z.coerce.string().meta({
		description: "The user id",
	}),
});

/**
 * ### Endpoint
 *
 * POST `/admin/remove-user`
 *
 * ### API Methods
 *
 * **server:**
 * `auth.api.removeUser`
 *
 * **client:**
 * `authClient.admin.removeUser`
 *
 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/admin#api-method-admin-remove-user)
 */
export const removeUser = (opts: AdminOptions) =>
	createAuthEndpoint(
		"/admin/remove-user",
		{
			method: "POST",
			body: removeUserBodySchema,
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

			if (ctx.body.userId === ctx.context.session.user.id) {
				throw new APIError("BAD_REQUEST", {
					message: ADMIN_ERROR_CODES.YOU_CANNOT_REMOVE_YOURSELF,
				});
			}

			const user = await ctx.context.internalAdapter.findUserById(
				ctx.body.userId,
			);

			if (!user) {
				throw new APIError("NOT_FOUND", {
					message: "User not found",
				});
			}

			await ctx.context.internalAdapter.deleteUser(ctx.body.userId);
			return ctx.json({
				success: true,
			});
		},
	);

const setUserPasswordBodySchema = z.object({
	newPassword: z.string().nonempty("newPassword cannot be empty").meta({
		description: "The new password",
	}),
	userId: z.coerce.string().nonempty("userId cannot be empty").meta({
		description: "The user id",
	}),
});

/**
 * ### Endpoint
 *
 * POST `/admin/set-user-password`
 *
 * ### API Methods
 *
 * **server:**
 * `auth.api.setUserPassword`
 *
 * **client:**
 * `authClient.admin.setUserPassword`
 *
 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/admin#api-method-admin-set-user-password)
 */
export const setUserPassword = (opts: AdminOptions) =>
	createAuthEndpoint(
		"/admin/set-user-password",
		{
			method: "POST",
			body: setUserPasswordBodySchema,
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
					message: ADMIN_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD,
				});
			}

			const { newPassword, userId } = ctx.body;
			const minPasswordLength = ctx.context.password.config.minPasswordLength;
			if (newPassword.length < minPasswordLength) {
				ctx.context.logger.error("Password is too short");
				throw new APIError("BAD_REQUEST", {
					message: BASE_ERROR_CODES.PASSWORD_TOO_SHORT,
				});
			}
			const maxPasswordLength = ctx.context.password.config.maxPasswordLength;
			if (newPassword.length > maxPasswordLength) {
				ctx.context.logger.error("Password is too long");
				throw new APIError("BAD_REQUEST", {
					message: BASE_ERROR_CODES.PASSWORD_TOO_LONG,
				});
			}
			const hashedPassword = await ctx.context.password.hash(newPassword);
			await ctx.context.internalAdapter.updatePassword(userId, hashedPassword);
			return ctx.json({
				status: true,
			});
		},
	);

const userHasPermissionBodySchema = z
	.object({
		userId: z.coerce.string().optional().meta({
			description: `The user id. Eg: "user-id"`,
		}),
		role: z.string().optional().meta({
			description: `The role to check permission for. Eg: "admin"`,
		}),
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
	);

/**
 * ### Endpoint
 *
 * POST `/admin/has-permission`
 *
 * ### API Methods
 *
 * **server:**
 * `auth.api.userHasPermission`
 *
 * **client:**
 * `authClient.admin.hasPermission`
 *
 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/admin#api-method-admin-has-permission)
 */
export const userHasPermission = <O extends AdminOptions>(opts: O) => {
	type DefaultStatements = typeof defaultStatements;
	type Statements =
		O["ac"] extends AccessControl<infer S> ? S : DefaultStatements;

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
				permissions?: never | undefined;
		  }
		| {
				permissions: PermissionType;
				permission?: never | undefined;
		  };

	return createAuthEndpoint(
		"/admin/has-permission",
		{
			method: "POST",
			body: userHasPermissionBodySchema,
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
						userId?: string | undefined;
						role?: InferAdminRolesFromOption<O> | undefined;
					},
				},
			},
		},
		async (ctx) => {
			if (!ctx.body?.permission && !ctx.body?.permissions) {
				throw new APIError("BAD_REQUEST", {
					message: "invalid permission check. no permission(s) were passed.",
				});
			}
			const session = await getSessionFromCtx(ctx);

			if (!session && (ctx.request || ctx.headers)) {
				throw new APIError("UNAUTHORIZED");
			}
			if (!session && !ctx.body.userId && !ctx.body.role) {
				throw new APIError("BAD_REQUEST", {
					message: "user id or role is required",
				});
			}
			const user =
				session?.user ||
				(ctx.body.role
					? { id: ctx.body.userId || "", role: ctx.body.role }
					: null) ||
				((await ctx.context.internalAdapter.findUserById(
					ctx.body.userId as string,
				)) as { role?: string | undefined; id: string });
			if (!user) {
				throw new APIError("BAD_REQUEST", {
					message: "user not found",
				});
			}
			const result = hasPermission({
				userId: user.id,
				role: user.role,
				options: opts as AdminOptions,
				permissions: (ctx.body.permissions ?? ctx.body.permission) as any,
			});
			return ctx.json({
				error: null,
				success: result,
			});
		},
	);
};
