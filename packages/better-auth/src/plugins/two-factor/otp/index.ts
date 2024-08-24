import { APIError } from "better-call";
import { createAuthEndpoint } from "../../../api/call";
import { sessionMiddleware } from "../../../api/middlewares/session";
import { TwoFactorProvider, UserWithTwoFactor } from "../types";
import { generateHOTP } from "oslo/otp";
import { generateRandomInteger } from "oslo/crypto";
import { OTP_RANDOM_NUMBER_COOKIE_NAME } from "../constant";
import { z } from "zod";
import { verifyTwoFactorMiddleware } from "../verify-middleware";

export interface OTPOptions {
	/**
	 * How long the opt will be valid for
	 *
	 * @default "5 mins"
	 */
	period?: number;
	sendOTP: (user: UserWithTwoFactor, otp: string) => Promise<void>;
}

/**
 * The otp adapter is created from the totp adapter.
 */
export const otp2fa = (options?: OTPOptions) => {
	/**
	 * Generate OTP and send it to the user.
	 */
	const generateOTP = createAuthEndpoint(
		"/generate/otp",
		{
			method: "POST",
			use: [sessionMiddleware],
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
			return ctx.json({ status: true });
		},
	);

	const verifyOTP = createAuthEndpoint(
		"/verify/otp",
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
				throw new APIError("BAD_REQUEST", {
					message: "counter cookie not found",
				});
			}
			const toCheckOtp = await generateHOTP(
				Buffer.from(ctx.context.secret),
				parseInt(randomNumber),
			);

			if (toCheckOtp !== ctx.body.code) {
				await ctx.context.createSession();
				return ctx.json({ status: true });
			} else {
				return ctx.json(
					{ status: false },
					{
						status: 401,
					},
				);
			}
		},
	);

	return {
		id: "otp",
		verify: verifyOTP,
		customActions: {
			generateOTP: generateOTP,
		},
	} satisfies TwoFactorProvider;
};
