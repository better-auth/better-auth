import { APIError } from "better-call";
import { createAuthMiddleware } from "../../api/call";
import { TRUST_DEVICE_COOKIE_NAME, TWO_FACTOR_COOKIE_NAME } from "./constant";
import { setSessionCookie } from "../../cookies";
import { z } from "zod";
import { getSessionFromCtx } from "../../api";
import type { UserWithTwoFactor } from "./types";
import { createHMAC } from "@better-auth/utils/hmac";
import type { GenericEndpointContext } from "../../types";

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
			const dontRememberMe = await ctx.getSignedCookie(
				ctx.context.authCookies.dontRememberToken.name,
				ctx.context.secret,
			);
			const session = await ctx.context.internalAdapter.createSession(
				userId,
				ctx.headers,
				!!dontRememberMe,
			);
			if (!session) {
				throw new APIError("INTERNAL_SERVER_ERROR", {
					message: "failed to create session",
				});
			}
			return {
				valid: async (ctx: GenericEndpointContext) => {
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
						const token = await createHMAC("SHA-256", "base64urlnopad").sign(
							ctx.context.secret,
							`${user.id}!${session.token}`,
						);
						await ctx.setSignedCookie(
							trustDeviceCookie.name,
							`${token}!${session.token}`,
							ctx.context.secret,
							trustDeviceCookie.attributes,
						);
						// delete the dont remember me cookie
						ctx.setCookie(ctx.context.authCookies.dontRememberToken.name, "", {
							maxAge: 0,
						});
						// delete the two factor cookie
						ctx.setCookie(cookieName.name, "", {
							maxAge: 0,
						});
					}
					return ctx.json({
						token: session.token,
						user: {
							id: user.id,
							email: user.email,
							emailVerified: user.emailVerified,
							name: user.name,
							image: user.image,
							createdAt: user.createdAt,
							updatedAt: user.updatedAt,
						},
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
			valid: async (ctx: GenericEndpointContext) => {
				return ctx.json({
					token: session.session.token,
					user: {
						id: session.user.id,
						email: session.user.email,
						emailVerified: session.user.emailVerified,
						name: session.user.name,
						image: session.user.image,
						createdAt: session.user.createdAt,
						updatedAt: session.user.updatedAt,
					},
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
