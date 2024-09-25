import { APIError } from "better-call";
import { generateRandomInteger } from "oslo/crypto";
import { generateHOTP, TOTPController } from "oslo/otp";
import { z } from "zod";
import { createAuthEndpoint } from "../../../api/call";
import { OTP_RANDOM_NUMBER_COOKIE_NAME } from "../constant";
import { verifyTwoFactorMiddleware } from "../verify-middleware";
import type { TwoFactorProvider, UserWithTwoFactor } from "../types";
import { TimeSpan } from "oslo";

export interface OTPOptions {
	/**
	 * How long the opt will be valid for in
	 * minutes
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
	const opts = {
		period: new TimeSpan(options?.period || 5, "m"),
	};
	const totp = new TOTPController({
		digits: 6,
		period: opts.period,
	});
	/**
	 * Generate OTP and send it to the user.
	 */
	const send2FaOTP = createAuthEndpoint(
		"/two-factor/send-otp",
		{
			method: "POST",
			use: [verifyTwoFactorMiddleware],
		},
		async (ctx) => {
			if (!options || !options.sendOTP) {
				ctx.context.logger.error(
					"send otp isn't configured. Please configure the send otp function on otp options.",
				);
				throw new APIError("BAD_REQUEST", {
					message: "otp isn't configured",
				});
			}
			const user = ctx.context.session.user as UserWithTwoFactor;
			const code = await totp.generate(Buffer.from(user.twoFactorSecret));
			await options.sendOTP(user, code);
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
			const toCheckOtp = await totp.generate(Buffer.from(user.twoFactorSecret));
			if (toCheckOtp === ctx.body.code) {
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
