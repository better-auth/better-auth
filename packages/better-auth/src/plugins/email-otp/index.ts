import { z } from "zod";
import { APIError, createAuthEndpoint } from "../../api";
import type { BetterAuthPlugin, User } from "../../types";
import { alphabet, generateRandomString } from "../../crypto";
import { getDate } from "../../utils/date";
import { setSessionCookie } from "../../cookies";
import { getEndpointResponse } from "../../utils/plugin-helper";

interface EmailOTPOptions {
	/**
	 * Function to send email verification
	 */
	sendVerificationOTP: (
		data: {
			email: string;
			otp: string;
			type: "sign-in" | "email-verification";
		},
		request?: Request,
	) => Promise<void>;
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
	/**
	 * A boolean value that determines whether to prevent
	 * automatic sign-up when the user is not registered.
	 *
	 * @Default false
	 */
	disableSignUp?: boolean;
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
						ctx.context.logger.error(
							"send email verification is not implemented",
						);
						throw new APIError("BAD_REQUEST", {
							message: "send email verification is not implemented",
						});
					}
					const email = ctx.body.email;
					const otp = generateRandomString(opts.otpLength, alphabet("0-9"));
					await ctx.context.internalAdapter
						.createVerificationValue({
							value: otp,
							identifier: `${ctx.body.type}-otp-${email}`,
							expiresAt: getDate(opts.expireIn, "sec"),
						})
						.catch(async (error) => {
							// might be duplicate key error
							await ctx.context.internalAdapter.deleteVerificationByIdentifier(
								`${ctx.body.type}-otp-${email}`,
							);
							//try again
							await ctx.context.internalAdapter.createVerificationValue({
								value: otp,
								identifier: `${ctx.body.type}-otp-${email}`,
								expiresAt: getDate(opts.expireIn, "sec"),
							});
						});
					await options.sendVerificationOTP(
						{
							email,
							otp,
							type: ctx.body.type,
						},
						ctx.request,
					);
					return ctx.json({
						success: true,
					});
				},
			),
			createVerificationOTP: createAuthEndpoint(
				"/email-otp/create-verification-otp",
				{
					method: "POST",
					body: z.object({
						email: z.string(),
						type: z.enum(["email-verification", "sign-in"]),
					}),
					metadata: {
						SERVER_ONLY: true,
					},
				},
				async (ctx) => {
					const email = ctx.body.email;
					const otp = generateRandomString(opts.otpLength, alphabet("0-9"));
					await ctx.context.internalAdapter.createVerificationValue({
						value: otp,
						identifier: `${ctx.body.type}-otp-${email}`,
						expiresAt: getDate(opts.expireIn, "sec"),
					});
					return otp;
				},
			),
			getVerificationOTP: createAuthEndpoint(
				"/email-otp/get-verification-otp",
				{
					method: "GET",
					query: z.object({
						email: z.string(),
						type: z.enum(["email-verification", "sign-in"]),
					}),
					metadata: {
						SERVER_ONLY: true,
					},
				},
				async (ctx) => {
					const email = ctx.query.email;
					const verificationValue =
						await ctx.context.internalAdapter.findVerificationValue(
							`${ctx.query.type}-otp-${email}`,
						);
					if (!verificationValue || verificationValue.expiresAt < new Date()) {
						return ctx.json({
							otp: null,
						});
					}
					return ctx.json({
						otp: verificationValue.value,
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
						if (opts.disableSignUp) {
							throw new APIError("BAD_REQUEST", {
								message: "User not found",
							});
						}
						const newUser = await ctx.context.internalAdapter.createUser({
							email,
							emailVerified: true,
							name: email,
						});
						const session = await ctx.context.internalAdapter.createSession(
							newUser.id,
							ctx.request,
						);
						await setSessionCookie(ctx, {
							session,
							user: newUser,
						});
						return ctx.json({
							user: newUser,
							session,
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
						const response = await getEndpointResponse<{
							user: User;
						}>(ctx);
						if (!response) {
							return;
						}
						if (response.user.email && response.user.emailVerified === false) {
							const otp = generateRandomString(opts.otpLength, alphabet("0-9"));
							await ctx.context.internalAdapter.createVerificationValue({
								value: otp,
								identifier: `email-verification-otp-${response.user.email}`,
								expiresAt: getDate(opts.expireIn, "sec"),
							});
							await options.sendVerificationOTP(
								{
									email: response.user.email,
									otp,
									type: "email-verification",
								},
								ctx.request,
							);
						}
					},
				},
			],
		},
	} satisfies BetterAuthPlugin;
};
