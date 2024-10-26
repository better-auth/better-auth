import { z } from "zod";
import { APIError, createAuthEndpoint, sessionMiddleware } from "../../api";
import type { BetterAuthPlugin, User } from "../../types";
import { alphabet, generateRandomString } from "../../crypto";
import { getDate } from "../../utils/date";
import { logger } from "../../utils";
import { setSessionCookie } from "../../cookies";

interface EmailOTPOptions {
	/**
	 * Function to send email verification
	 */
	sendVerificationOTP: (data: {
		email: string;
		otp: string;
		type: "sign-in" | "email-verification";
	}) => Promise<void>;
	/**
	 * Length of the OTP
	 */
	otpLength?: number;
	/**
	 * Expiry time of the OTP in seconds
	 */
	expiresIn?: number;
	/**
	 * Send email verification on sign-up
	 *
	 * @Default false
	 */
	sendVerificationOnSignUp?: boolean;
}

export const emailOTP = (options: EmailOTPOptions) => {
	const opts = {
		expireIn: 5 * 60,
		otpLength: 6,
		...options,
	};
	return {
		id: "email-otp",
		endpoints: {
			sendVerificationOTP: createAuthEndpoint(
				"/email-otp/send-verification-otp",
				{
					method: "POST",
					body: z.object({
						email: z.string(),
						type: z.enum(["email-verification", "sign-in"]),
					}),
				},
				async (ctx) => {
					if (!options?.sendVerificationOTP) {
						logger.error("send email verification is not implemented");
						throw new APIError("BAD_REQUEST", {
							message: "send email verification is not implemented",
						});
					}
					const email = ctx.body.email;
					const otp = generateRandomString(opts.otpLength, alphabet("0-9"));
					await ctx.context.internalAdapter.createVerificationValue({
						value: otp,
						identifier: `${ctx.body.type}-otp-${email}`,
						expiresAt: getDate(opts.expireIn, "sec"),
					});
					await options.sendVerificationOTP({
						email,
						otp,
						type: ctx.body.type,
					});
					return ctx.json({
						success: true,
					});
				},
			),
			verifyEmailOTP: createAuthEndpoint(
				"/email-otp/verify-email",
				{
					method: "POST",
					body: z.object({
						email: z.string(),
						otp: z.string(),
					}),
				},
				async (ctx) => {
					const email = ctx.body.email;
					const verificationValue =
						await ctx.context.internalAdapter.findVerificationValue(
							`email-verification-otp-${email}`,
						);
					if (!verificationValue || verificationValue.expiresAt < new Date()) {
						if (verificationValue) {
							await ctx.context.internalAdapter.deleteVerificationValue(
								verificationValue.id,
							);
						}
						throw new APIError("BAD_REQUEST", {
							message: "Invalid OTP",
						});
					}
					const otp = ctx.body.otp;
					if (verificationValue.value !== otp) {
						throw new APIError("BAD_REQUEST", {
							message: "Invalid OTP",
						});
					}
					await ctx.context.internalAdapter.deleteVerificationValue(
						verificationValue.id,
					);
					const user = await ctx.context.internalAdapter.findUserByEmail(email);
					if (!user) {
						throw new APIError("BAD_REQUEST", {
							message: "User not found",
						});
					}
					const updatedUser = await ctx.context.internalAdapter.updateUser(
						user.user.id,
						{
							email,
							emailVerified: true,
						},
					);
					return ctx.json({
						user: updatedUser,
					});
				},
			),
			signInEmailOTP: createAuthEndpoint(
				"/sign-in/email-otp",
				{
					method: "POST",
					body: z.object({
						email: z.string(),
						otp: z.string(),
					}),
				},
				async (ctx) => {
					const email = ctx.body.email;
					const verificationValue =
						await ctx.context.internalAdapter.findVerificationValue(
							`sign-in-otp-${email}`,
						);
					if (!verificationValue || verificationValue.expiresAt < new Date()) {
						if (verificationValue) {
							await ctx.context.internalAdapter.deleteVerificationValue(
								verificationValue.id,
							);
						}
						throw new APIError("BAD_REQUEST", {
							message: "Invalid OTP",
						});
					}
					const otp = ctx.body.otp;
					if (verificationValue.value !== otp) {
						throw new APIError("BAD_REQUEST", {
							message: "Invalid OTP",
						});
					}
					await ctx.context.internalAdapter.deleteVerificationValue(
						verificationValue.id,
					);
					const user = await ctx.context.internalAdapter.findUserByEmail(email);
					if (!user) {
						throw new APIError("BAD_REQUEST", {
							message: "User not found",
						});
					}
					const session = await ctx.context.internalAdapter.createSession(
						user.user.id,
						ctx.request,
					);
					await setSessionCookie(ctx, {
						session,
						user: user.user,
					});
					return ctx.json({
						session,
						user,
					});
				},
			),
		},
		hooks: {
			after: [
				{
					matcher(context) {
						return !!(
							context.path?.startsWith("/sign-up") &&
							opts.sendVerificationOnSignUp
						);
					},
					async handler(ctx) {
						const returned = ctx.context.returned as Response;
						if (returned?.status !== 200) {
							return;
						}
						const response = (await returned.clone().json()) as {
							user: User;
						};
						if (response.user.email && response.user.emailVerified === false) {
							const otp = generateRandomString(opts.otpLength, alphabet("0-9"));
							await ctx.context.internalAdapter.createVerificationValue({
								value: otp,
								identifier: `email-verification-otp-${response.user.email}`,
								expiresAt: getDate(opts.expireIn, "sec"),
							});
							await options.sendVerificationOTP({
								email: response.user.email,
								otp,
								type: "email-verification",
							});
						}
					},
				},
			],
		},
	} satisfies BetterAuthPlugin;
};
