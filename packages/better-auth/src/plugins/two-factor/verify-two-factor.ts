import type { GenericEndpointContext } from "@better-auth/core";
import { APIError } from "@better-auth/core/error";
import { createHMAC } from "@better-auth/utils/hmac";
import { getSessionFromCtx } from "../../api";
import { setSessionCookie } from "../../cookies";
import {
	TRUST_DEVICE_COOKIE_MAX_AGE,
	TRUST_DEVICE_COOKIE_NAME,
	TWO_FACTOR_COOKIE_NAME,
} from "./constant";
import { TWO_FACTOR_ERROR_CODES } from "./error-code";
import type { UserWithTwoFactor } from "./types";

export async function verifyTwoFactor(
	ctx: GenericEndpointContext, 
	options?: { 
		cookieName?: string;
		trustDeviceOptions?: {
			disabled?: boolean;
			maxAge?: number;
			name?: string;
		};
		storeStrategy?: 'cookie' | 'database' | 'cookieAndDatabase';
		verificationToken?: string;
	}
) {
	const invalid = (errorKey: keyof typeof TWO_FACTOR_ERROR_CODES) => {
		throw APIError.from("UNAUTHORIZED", TWO_FACTOR_ERROR_CODES[errorKey]);
	};

	const session = await getSessionFromCtx(ctx);
	if (!session) {
		const storeStrategy = options?.storeStrategy ?? 'cookie';
		const cookieNameValue = options?.cookieName ?? TWO_FACTOR_COOKIE_NAME;
		const cookieName = ctx.context.createAuthCookie(cookieNameValue);
		
		let identifier: string | undefined;
		
		// Handle different storage strategies
		if (storeStrategy === 'cookie' || storeStrategy === 'cookieAndDatabase') {
			// Get identifier from cookie
			const twoFactorCookie = await ctx.getSignedCookie(
				cookieName.name,
				ctx.context.secret,
			);
			if (!twoFactorCookie) {
				throw APIError.from(
					"UNAUTHORIZED",
					TWO_FACTOR_ERROR_CODES.INVALID_TWO_FACTOR_COOKIE,
				);
			}
			identifier = twoFactorCookie;
		}
		
		// For database or cookieAndDatabase, also check verification token
		if (storeStrategy === 'database' || storeStrategy === 'cookieAndDatabase') {
			// If database only, get identifier from the provided verification token
			if (storeStrategy === 'database' && options?.verificationToken) {
				identifier = options.verificationToken;
			} else if (storeStrategy === 'cookieAndDatabase' && !identifier) {
				// If cookieAndDatabase but no cookie, fail
				throw APIError.from(
					"UNAUTHORIZED",
					TWO_FACTOR_ERROR_CODES.INVALID_TWO_FACTOR_COOKIE,
				);
			}
		}
		
		if (!identifier) {
			throw APIError.from(
				"UNAUTHORIZED",
				TWO_FACTOR_ERROR_CODES.INVALID_TWO_FACTOR_COOKIE,
			);
		}
		
		const verificationToken =
			await ctx.context.internalAdapter.findVerificationValue(identifier);
		if (!verificationToken) {
			throw APIError.from(
				"UNAUTHORIZED",
				TWO_FACTOR_ERROR_CODES.INVALID_TWO_FACTOR_COOKIE,
			);
		}
		const user = (await ctx.context.internalAdapter.findUserById(
			verificationToken.value,
		)) as UserWithTwoFactor;
		if (!user) {
			throw APIError.from(
				"UNAUTHORIZED",
				TWO_FACTOR_ERROR_CODES.INVALID_TWO_FACTOR_COOKIE,
			);
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
					throw APIError.from("INTERNAL_SERVER_ERROR", {
						message: "failed to create session",
						code: "FAILED_TO_CREATE_SESSION",
					});
				}
				// Delete the verification token from the database after successful verification
				await ctx.context.internalAdapter.deleteVerificationValue(
					verificationToken.id,
				);
				await setSessionCookie(ctx, {
					session,
					user,
				});
				// Always clear the two factor cookie after successful verification
				ctx.setCookie(cookieName.name, "", {
					maxAge: 0,
				});
				if (ctx.body.trustDevice && !options?.trustDeviceOptions?.disabled) {
					const trustDeviceName = options?.trustDeviceOptions?.name ?? TRUST_DEVICE_COOKIE_NAME;
					const trustDeviceMaxAge = options?.trustDeviceOptions?.maxAge ?? TRUST_DEVICE_COOKIE_MAX_AGE;
					
					const trustDeviceCookie = ctx.context.createAuthCookie(
						trustDeviceName,
						{
							maxAge: trustDeviceMaxAge,
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
			key: identifier,
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
