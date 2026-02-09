import type { Session, User } from "better-auth";
import { createAuthEndpoint } from "better-auth/api";
import z from "zod";
import { jwtMiddleware } from "../jwt";
import type { DashOptionsInternal } from "../types";

export const deleteSessions = (options: DashOptionsInternal) => {
	return createAuthEndpoint(
		"/dash/delete-sessions",
		{
			method: "POST",
			use: [
				jwtMiddleware(
					options,
					z.object({
						userId: z.string(),
					}),
				),
			],
		},
		async (ctx) => {
			await ctx.context.internalAdapter.deleteSessions(
				ctx.context.payload.userId,
			);
			return ctx.json({ message: "Sessions deleted" });
		},
	);
};

export const listAllSessions = (options: DashOptionsInternal) => {
	return createAuthEndpoint(
		"/dash/list-all-sessions",
		{
			method: "GET",
			use: [jwtMiddleware(options)],
			query: z
				.object({
					limit: z.number().optional(),
					offset: z.number().optional(),
				})
				.optional(),
		},
		async (ctx) => {
			const sessionsCount = await ctx.context.adapter.count({
				model: "session",
			});
			const sessions = await ctx.context.adapter.findMany<Session>({
				model: "session",
				limit: ctx.query?.limit || sessionsCount,
				offset: ctx.query?.offset || 0,
				sortBy: {
					field: "createdAt",
					direction: "desc",
				},
			});
			const users = await ctx.context.adapter.findMany<User>({
				model: "user",
				where: [
					{
						field: "id",
						value: sessions.map((s) => s.userId),
						operator: "in",
					},
				],
			});
			return users.map((u) => {
				return {
					...u,
					sessions: sessions.filter((s) => s.userId === u.id),
				};
			});
		},
	);
};

export const revokeSession = (options: DashOptionsInternal) =>
	createAuthEndpoint(
		"/dash/sessions/revoke",
		{
			method: "POST",
			use: [jwtMiddleware(options)],
			metadata: {
				allowedMediaTypes: ["application/json", ""],
			},
		},
		async (ctx) => {
			const { sessionId, userId } = ctx.context.payload as {
				sessionId: string;
				userId: string;
			};
			if (!sessionId || !userId) {
				throw ctx.error("FORBIDDEN", {
					message: "Invalid payload",
				});
			}

			const session = await ctx.context.adapter.findOne<Session>({
				model: "session",
				where: [
					{ field: "id", value: sessionId },
					{ field: "userId", value: userId },
				],
			});

			if (!session) {
				throw ctx.error("NOT_FOUND", {
					message: "Session not found",
				});
			}

			await ctx.context.internalAdapter.deleteSession(session.token);

			return ctx.json({
				success: true,
			});
		},
	);

export const revokeAllSessions = (options: DashOptionsInternal) =>
	createAuthEndpoint(
		"/dash/sessions/revoke-all",
		{
			method: "POST",
			use: [jwtMiddleware(options)],
			body: z.object({
				userId: z.string(),
			}),
		},
		async (ctx) => {
			const { userId } = ctx.body;
			const user = await ctx.context.internalAdapter.findUserById(userId);
			if (!user) {
				throw ctx.error("NOT_FOUND", {
					message: "User not found",
				});
			}
			await ctx.context.internalAdapter.deleteSessions(userId);

			return ctx.json({
				success: true,
			});
		},
	);
