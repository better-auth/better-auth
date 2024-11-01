import { APIError } from "better-call";
import type { Session } from "../../db/schema";
import { createAuthMiddleware } from "../../api/call";
import { hs256 } from "../../crypto";
import { TRUST_DEVICE_COOKIE_NAME, TWO_FACTOR_COOKIE_NAME } from "./constant";
import type { UserWithTwoFactor } from "./types";
import { setSessionCookie } from "../../cookies";
import { z } from "zod";
import { getSessionFromCtx } from "../../api";

export const verifyTwoFactorMiddleware = createAuthMiddleware(
	{
		body: z.object({
			/**
			 * if true, the device will be trusted
			 * for 30 days. It'll be refreshed on
			 * every sign in request within this time.
			 */
			trustDevice: z.boolean().optional(),
		}),
	},
	async (ctx) => {
		const session = await getSessionFromCtx(ctx);
		if (!session) {
			const cookieName = ctx.context.createAuthCookie(TWO_FACTOR_COOKIE_NAME);
			const cookie = await ctx.getSignedCookie(
				cookieName.name,
				ctx.context.secret,
			);
			if (!cookie) {
				throw new APIError("UNAUTHORIZED", {
					message: "invalid two factor cookie",
				});
			}
			const [userId, hash] = cookie.split("!");
			if (!userId || !hash) {
				throw new APIError("UNAUTHORIZED", {
					message: "invalid two factor cookie",
				});
			}
			const sessions = await ctx.context.adapter.findMany<Session>({
				model: ctx.context.tables.session.tableName,
				where: [
					{
						field: "userId",
						value: userId,
					},
				],
			});
			if (!sessions.length) {
				throw new APIError("UNAUTHORIZED", {
					message: "invalid session",
				});
			}
			const activeSessions = sessions.filter(
				(session) => session.expiresAt > new Date(),
			);
			if (!activeSessions) {
				throw new APIError("UNAUTHORIZED", {
					message: "invalid session",
				});
			}
			for (const session of activeSessions) {
				const hashToMatch = await hs256(ctx.context.secret, session.id);
				const user = await ctx.context.adapter.findOne<UserWithTwoFactor>({
					model: ctx.context.tables.user.tableName,
					where: [
						{
							field: "id",
							value: session.userId,
						},
					],
				});
				if (!user) {
					throw new APIError("UNAUTHORIZED", {
						message: "invalid session",
					});
				}
				if (hashToMatch === hash) {
					return {
						valid: async () => {
							await setSessionCookie(
								ctx,
								{
									session,
									user,
								},
								false,
							);
							if (ctx.body.trustDevice) {
								const trustDeviceCookie = ctx.context.createAuthCookie(
									TRUST_DEVICE_COOKIE_NAME,
									{
										maxAge: 30 * 24 * 60 * 60, // 30 days, it'll be refreshed on sign in requests
									},
								);
								/**
								 * create a token that will be used to
								 * verify the device
								 */
								const token = await hs256(
									ctx.context.secret,
									`${user.id}!${session.id}`,
								);

								await ctx.setSignedCookie(
									trustDeviceCookie.name,
									`${token}!${session.id}`,
									ctx.context.secret,
									trustDeviceCookie.attributes,
								);
							}
							return ctx.json({
								session,
								user,
							});
						},
						invalid: async () => {
							throw new APIError("UNAUTHORIZED", {
								message: "invalid two factor authentication",
							});
						},
						session: {
							id: session.id,
							userId: session.userId,
							expiresAt: session.expiresAt,
							user,
						},
					};
				}
			}
			throw new APIError("UNAUTHORIZED", {
				message: "invalid two factor cookie",
			});
		}
		return {
			valid: async () => {
				return ctx.json({
					session,
					user: session.user,
				});
			},
			invalid: async () => {
				throw new APIError("UNAUTHORIZED", {
					message: "invalid two factor authentication",
				});
			},
			session,
		};
	},
);
