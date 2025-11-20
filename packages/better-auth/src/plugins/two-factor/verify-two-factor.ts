import type { GenericEndpointContext } from "@better-auth/core";
import { createHMAC } from "@better-auth/utils/hmac";
import { APIError } from "better-call";
import { getSessionFromCtx } from "../../api";
import { setSessionCookie } from "../../cookies";
import {
	TRUST_DEVICE_COOKIE_MAX_AGE,
	TRUST_DEVICE_COOKIE_NAME,
	TWO_FACTOR_COOKIE_NAME,
} from "./constant";
import { TWO_FACTOR_ERROR_CODES } from "./error-code";
import type { UserWithTwoFactor } from "./types";

export async function verifyTwoFactor(ctx: GenericEndpointContext) {
	const invalid = (errorKey: keyof typeof TWO_FACTOR_ERROR_CODES) => {
		throw new APIError("UNAUTHORIZED", {
			message: TWO_FACTOR_ERROR_CODES[errorKey],
		});
	};

	const session = await getSessionFromCtx(ctx);
	if (!session) {
		const cookieName = ctx.context.createAuthCookie(TWO_FACTOR_COOKIE_NAME);
		const twoFactorCookie = await ctx.getSignedCookie(
			cookieName.name,
			ctx.context.secret,
		);
		if (!twoFactorCookie) {
			throw new APIError("UNAUTHORIZED", {
				message: TWO_FACTOR_ERROR_CODES.INVALID_TWO_FACTOR_COOKIE,
			});
		}
		const verificationToken =
			await ctx.context.internalAdapter.findVerificationValue(twoFactorCookie);
		if (!verificationToken) {
			throw new APIError("UNAUTHORIZED", {
				message: TWO_FACTOR_ERROR_CODES.INVALID_TWO_FACTOR_COOKIE,
			});
		}
		const user = (await ctx.context.internalAdapter.findUserById(
			verificationToken.value,
		)) as UserWithTwoFactor;
		if (!user) {
			throw new APIError("UNAUTHORIZED", {
				message: TWO_FACTOR_ERROR_CODES.INVALID_TWO_FACTOR_COOKIE,
			});
		}
		const dontRememberMe = await ctx.getSignedCookie(
			ctx.context.authCookies.dontRememberToken.name,
			ctx.context.secret,
		);
		return {
			valid: async (ctx: GenericEndpointContext) => {
				const session = await ctx.context.internalAdapter.createSession(
					verificationToken.value,
					!!dontRememberMe,
				);
				if (!session) {
					throw new APIError("INTERNAL_SERVER_ERROR", {
						message: "failed to create session",
					});
				}
				await setSessionCookie(ctx, {
					session,
					user,
				});
				if (ctx.body.trustDevice) {
					const trustDeviceCookie = ctx.context.createAuthCookie(
						TRUST_DEVICE_COOKIE_NAME,
						{
							maxAge: TRUST_DEVICE_COOKIE_MAX_AGE,
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
			invalid,
			session: {
				session: null,
				user,
			},
			key: twoFactorCookie,
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
		invalid,
		session,
		key: `${session.user.id}!${session.session.id}`,
	};
}
