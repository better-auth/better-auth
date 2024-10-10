import { z } from "zod";
import {
	APIError,
	createAuthEndpoint,
	createAuthMiddleware,
	getSessionFromCtx,
	sessionMiddleware,
} from "../../api";
import type { BetterAuthPlugin, Session, User } from "../../types";

interface UserWithRole extends User {
	role?: string;
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
			setAdmin: createAuthEndpoint(
				"/admin/set-admin",
				{
					method: "POST",
					body: z.object({
						userId: z.string(),
					}),
					use: [adminMiddleware],
				},
				async (ctx) => {
					const updatedUser = await ctx.context.internalAdapter.updateUser(
						ctx.body.userId,
						{
							role: "admin",
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
					const user =
						await ctx.context.internalAdapter.createUser<UserWithRole>({
							email: ctx.body.email,
							name: ctx.body.name,
							role: ctx.body.role,
							...ctx.body.data,
						});

					if (!user) {
						throw new APIError("BAD_REQUEST", {
							message: "User already exists",
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
						limit: z.number().optional(),
						offset: z.number().optional(),
						sortBy: z.string().optional(),
					}),
				},
				async (ctx) => {
					const users = await ctx.context.internalAdapter.listUsers(
						ctx.query.limit,
						ctx.query.offset,
					);
					return {
						users: users as UserWithRole[],
					};
				},
			),
			deleteUser: createAuthEndpoint(
				"/admin/delete-user",
				{
					method: "POST",
					body: z.object({
						userId: z.string(),
					}),
					use: [adminMiddleware],
				},
				async (ctx) => {
					if (ctx.body.userId === ctx.context.session.user.id) {
						throw new APIError("BAD_REQUEST", {
							message: "You cannot delete yourself",
						});
					}
					await ctx.context.internalAdapter.deleteUser(ctx.body.userId);
				},
			),
			banUser: createAuthEndpoint(
				"/admin/ban-user",
				{
					method: "POST",
					body: z.object({
						userId: z.string(),
					}),
					use: [adminMiddleware],
				},
				async (ctx) => {
					if (ctx.body.userId === ctx.context.session.user.id) {
						throw new APIError("BAD_REQUEST", {
							message: "You cannot ban yourself",
						});
					}
					await ctx.context.internalAdapter.updateUser(ctx.body.userId, {
						banned: true,
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
						},
					);
					return {
						session: session,
						user: targetUser,
					};
				},
			),
		},
		schema: {
			user: {
				fields: {
					role: {
						type: "string",
					},
					banned: {
						type: "boolean",
						defaultValue: false,
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
