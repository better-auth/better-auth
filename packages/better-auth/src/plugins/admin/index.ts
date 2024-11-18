import { z } from "zod";
import {
	APIError,
	createAuthEndpoint,
	createAuthMiddleware,
	getSessionFromCtx,
	sessionMiddleware,
} from "../../api";
import {
	type BetterAuthPlugin,
	type InferOptionSchema,
	type PluginSchema,
	type Session,
	type User,
	type Where,
} from "../../types";
import { deleteSessionCookie, setSessionCookie } from "../../cookies";
import { getDate } from "../../utils/date";
import { mergeSchema } from "../../db/schema";

export interface UserWithRole extends User {
	role?: string | null;
	banned?: boolean | null;
	banReason?: string | null;
	banExpires?: number | null;
}

interface SessionWithImpersonatedBy extends Session {
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
										if (user.banExpires && user.banExpires < Date.now()) {
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
						const returned = ctx.context.returned;
						if (returned instanceof Response) {
							const json = (await returned
								.clone()
								.json()) as SessionWithImpersonatedBy[];
							const newJson = json.filter((session) => {
								return !session.impersonatedBy;
							});
							const response = new Response(JSON.stringify(newJson), {
								status: 200,
								statusText: "OK",
								headers: returned.headers,
							});
							return ctx.json({
								response: response,
							});
						}
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
						userId: z.string(),
						role: z.string(),
					}),
					use: [adminMiddleware],
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
						email: z.string(),
						password: z.string(),
						name: z.string(),
						role: z.string(),
						/**
						 * extra fields for user
						 */
						data: z.optional(z.record(z.any())),
					}),
					use: [adminMiddleware],
				},
				async (ctx) => {
					const existUser = await ctx.context.internalAdapter.findUserByEmail(
						ctx.body.email,
					);
					if (existUser) {
						throw new APIError("BAD_REQUEST", {
							message: "User already exists",
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
							message: "Failed to create user",
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
						searchValue: z.string().optional(),
						searchField: z.enum(["email", "name"]).optional(),
						searchOperator: z
							.enum(["contains", "starts_with", "ends_with"])
							.optional(),
						limit: z.string().or(z.number()).optional(),
						offset: z.string().or(z.number()).optional(),
						sortBy: z.string().optional(),
						sortDirection: z.enum(["asc", "desc"]).optional(),
						filterField: z.string().optional(),
						filterValue: z.string().or(z.number()).or(z.boolean()).optional(),
						filterOperator: z
							.enum(["eq", "ne", "lt", "lte", "gt", "gte"])
							.optional(),
					}),
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
						return ctx.json({
							users: users as UserWithRole[],
						});
					} catch (e) {
						console.log(e);
						return ctx.json({
							users: [],
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
						userId: z.string(),
					}),
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
						userId: z.string(),
					}),
					use: [adminMiddleware],
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
						userId: z.string(),
						/**
						 * Reason for the ban
						 */
						banReason: z.string().optional(),
						/**
						 * Number of seconds until the ban expires
						 */
						banExpiresIn: z.number().optional(),
					}),
					use: [adminMiddleware],
				},
				async (ctx) => {
					if (ctx.body.userId === ctx.context.session.user.id) {
						throw new APIError("BAD_REQUEST", {
							message: "You cannot ban yourself",
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
						userId: z.string(),
					}),
					use: [adminMiddleware],
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
							message: "Failed to create session",
						});
					}
					const authCookies = ctx.context.authCookies;
					deleteSessionCookie(ctx);
					await ctx.setSignedCookie(
						"admin_session",
						ctx.context.session.session.id,
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
						sessionId: z.string(),
					}),
					use: [adminMiddleware],
				},
				async (ctx) => {
					await ctx.context.internalAdapter.deleteSession(ctx.body.sessionId);
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
						userId: z.string(),
					}),
					use: [adminMiddleware],
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
						userId: z.string(),
					}),
					use: [adminMiddleware],
				},
				async (ctx) => {
					await ctx.context.internalAdapter.deleteUser(ctx.body.userId);
					return ctx.json({
						success: true,
					});
				},
			),
		},
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
} satisfies PluginSchema;
