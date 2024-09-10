import { APIError } from "better-call";
import { generateRandomInteger } from "oslo/crypto";
import { generateHOTP } from "oslo/otp";
import { z } from "zod";
import { createAuthEndpoint } from "../../../api/call";
import { OTP_RANDOM_NUMBER_COOKIE_NAME } from "../constant";
import { verifyTwoFactorMiddleware } from "../verify-middleware";
import type { TwoFactorProvider, UserWithTwoFactor } from "../types";

export interface OTPOptions {
	/**
	 * How long the opt will be valid for
	 *
	 * @default "5 mins"
	 */
	period?: number;
	/**
	 * Send the otp to the user
	 *
	 * @param user - The user to send the otp to
	 * @param otp - The otp to send
	 * @returns void | Promise<void>
	 */
	sendOTP?: (user: UserWithTwoFactor, otp: string) => Promise<void> | void;
}

/**
 * The otp adapter is created from the totp adapter.
 */
export const otp2fa = (options?: OTPOptions) => {
	/**
	 * Generate OTP and send it to the user.
	 */
	const send2FaOTP = createAuthEndpoint(
		"/two-factor/send-otp",
		{
			method: "POST",
			body: z
				.object({
					/**
					 * should only be used for testing
					 * purposes. This will return the otp
					 * on the response body.
					 */
					returnOTP: z.boolean().default(false),
				})
				.optional(),
			use: [verifyTwoFactorMiddleware],
		},
		async (ctx) => {
			if (!options || !options.sendOTP) {
				ctx.context.logger.error(
					"otp isn't configured. please pass otp option on two factor plugin to enable otp",
				);
				throw new APIError("BAD_REQUEST", {
					message: "otp isn't configured",
				});
			}
			const randomNumber = generateRandomInteger(100000);
			const otp = await generateHOTP(
				Buffer.from(ctx.context.secret),
				randomNumber,
			);
			await options.sendOTP(ctx.context.session.user as UserWithTwoFactor, otp);
			const cookie = ctx.context.createAuthCookie(
				OTP_RANDOM_NUMBER_COOKIE_NAME,
				{
					maxAge: options.period,
				},
			);
			await ctx.setSignedCookie(
				cookie.name,
				randomNumber.toString(),
				ctx.context.secret,
				cookie.options,
			);
			/**
			 * only used for testing purposes
			 */
			if (ctx.body?.returnOTP) {
				return ctx.json({ OTP: otp, status: true });
			}
			return ctx.json({ status: true, OTP: undefined });
		},
	);

	const verifyOTP = createAuthEndpoint(
		"/two-factor/verify-otp",
		{
			method: "POST",
			body: z.object({
				code: z.string(),
			}),
			use: [verifyTwoFactorMiddleware],
		},
		async (ctx) => {
			const user = ctx.context.session.user;
			if (!user.twoFactorEnabled) {
				throw new APIError("BAD_REQUEST", {
					message: "two factor isn't enabled",
				});
			}
			const cookie = ctx.context.createAuthCookie(
				OTP_RANDOM_NUMBER_COOKIE_NAME,
			);
			const randomNumber = await ctx.getSignedCookie(
				cookie.name,
				ctx.context.secret,
			);
			if (!randomNumber) {
				throw new APIError("UNAUTHORIZED", {
					message: "OTP is expired",
				});
			}
			const toCheckOtp = await generateHOTP(
				Buffer.from(ctx.context.secret),
				parseInt(randomNumber),
			);
			if (toCheckOtp === ctx.body.code) {
				ctx.setCookie(cookie.name, "", {
					path: "/",
					sameSite: "lax",
					httpOnly: true,
					secure: false,
					maxAge: 0,
				});
				return ctx.context.valid();
			} else {
				return ctx.context.invalid();
			}
		},
	);
	return {
		id: "otp",
		endpoints: {
			send2FaOTP,
			verifyOTP,
		},
	} satisfies TwoFactorProvider;
};
