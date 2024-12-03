import { APIError } from "better-call";
import { createAuthMiddleware } from "../../api/call";
import { hs256 } from "../../crypto";
import { TRUST_DEVICE_COOKIE_NAME, TWO_FACTOR_COOKIE_NAME } from "./constant";
import { setSessionCookie } from "../../cookies";
import { z } from "zod";
import { getSessionFromCtx } from "../../api";
import type { UserWithTwoFactor } from "./types";

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
			const userId = await ctx.getSignedCookie(
				cookieName.name,
				ctx.context.secret,
			);
			if (!userId) {
				throw new APIError("UNAUTHORIZED", {
					message: "invalid two factor cookie",
				});
			}
			const user = (await ctx.context.internalAdapter.findUserById(
				userId,
			)) as UserWithTwoFactor;
			if (!user) {
				throw new APIError("UNAUTHORIZED", {
					message: "invalid two factor cookie",
				});
			}
			const session = await ctx.context.internalAdapter.createSession(
				userId,
				ctx.request,
			);
			if (!session) {
				throw new APIError("INTERNAL_SERVER_ERROR", {
					message: "failed to create session",
				});
			}
			return {
				valid: async () => {
					await setSessionCookie(ctx, {
						session,
						user,
					});
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
							`${user.id}!${session.token}`,
						);

						await ctx.setSignedCookie(
							trustDeviceCookie.name,
							`${token}!${session.token}`,
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
					session,
					user,
				},
			};
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
