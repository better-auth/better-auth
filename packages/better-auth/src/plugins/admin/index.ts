import { z } from "zod";
import {
	APIError,
	createAuthEndpoint,
	createAuthMiddleware,
	getSessionFromCtx,
} from "../../api";
import type { BetterAuthPlugin, Session, User } from "../../types";
import { setSessionCookie } from "../../cookies";

export interface UserWithRole extends User {
	role?: string;
	banned?: boolean;
	banReason?: string;
	banExpires?: number;
}

interface SessionWithImpersonatedBy extends Session {
	impersonatedBy?: string;
}

export const adminMiddleware = createAuthMiddleware(async (ctx) => {
	const session = await getSessionFromCtx(ctx);
	if (!session?.session) {
		throw new APIError("UNAUTHORIZED");
	}
	const user = session.user as UserWithRole;
	if (user.role !== "admin") {
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

export const admin = () => {
	return {
		id: "admin",
		init(ctx) {
			return {
				options: {
					databaseHooks: {
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
						return context.path === "/user/list-sessions";
					},
					handler: createAuthMiddleware(async (ctx) => {
						const returned = ctx.context.returned;
						if (returned) {
							const json =
								(await returned.json()) as SessionWithImpersonatedBy[];
							const newJson = json.filter((session) => {
								return !session.impersonatedBy;
							});
							const response = new Response(JSON.stringify(newJson), {
								status: 200,
								statusText: "OK",
								headers: returned.headers,
							});
							return {
								response: response,
							};
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
					return {
						user: updatedUser as UserWithRole,
					};
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
						role: z.enum(["user", "admin"]),
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
					return {
						user: user as UserWithRole,
					};
				},
			),
			listUsers: createAuthEndpoint(
				"/admin/list-users",
				{
					method: "GET",
					use: [adminMiddleware],
					query: z.object({
						limit: z.string().or(z.number()).optional(),
						offset: z.string().or(z.number()).optional(),
						sortBy: z.string().optional(),
						sortDirection: z.enum(["asc", "desc"]).optional(),
					}),
				},
				async (ctx) => {
					const users = await ctx.context.internalAdapter.listUsers(
						Number(ctx.query?.limit) || undefined,
						Number(ctx.query?.offset) || undefined,
						ctx.query?.sortBy
							? {
									field: ctx.query.sortBy,
									direction: ctx.query.sortDirection || "asc",
								}
							: undefined,
					);
					return {
						users: users as UserWithRole[],
					};
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
					return {
						user: user,
					};
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
							banReason: ctx.body.banReason,
							banExpires: ctx.body.banExpiresIn
								? Date.now() + ctx.body.banExpiresIn * 1000
								: undefined,
						},
					);
					//revoke all sessions
					await ctx.context.internalAdapter.deleteSessions(ctx.body.userId);
					return {
						user: user,
					};
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
						},
					);
					if (!session) {
						throw new APIError("INTERNAL_SERVER_ERROR", {
							message: "Failed to create session",
						});
					}
					await setSessionCookie(ctx, session.id, true);
					return {
						session: session,
						user: targetUser,
					};
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
					return {
						success: true,
					};
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
					return {
						success: true,
					};
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
					return {
						success: true,
					};
				},
			),
		},
		schema: {
			user: {
				fields: {
					role: {
						type: "string",
						required: false,
					},
					banned: {
						type: "boolean",
						defaultValue: false,
						required: false,
					},
					banReason: {
						type: "string",
						required: false,
					},
					banExpires: {
						type: "number",
						required: false,
					},
				},
			},
			session: {
				fields: {
					impersonatedBy: {
						type: "string",
						required: false,
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
