import { z } from "zod";
import { APIError, createAuthEndpoint } from "../../api";
import type { BetterAuthPlugin } from "../../types";
import { generateRandomInteger } from "../../crypto";
import { getDate } from "../../utils/date";
import { logger } from "../../utils";
import { setSessionCookie } from "../../cookies";

interface EmailOTPOptions {
	sendEmailVerification?: (email: string, otp: string) => Promise<void>;
}

export const emailOTP = (options?: EmailOTPOptions) => {
	return {
		id: "email-otp",
		endpoints: {
			sendVerificationOTP: createAuthEndpoint(
				"/email-otp/send-verification-otp",
				{
					method: "POST",
					body: z.object({
						email: z.string(),
						for: z.enum(["email-verification", "sign-in"]),
					}),
				},
				async (ctx) => {
					if (!options?.sendEmailVerification) {
						logger.error("send email verification is not implemented");
						throw new APIError("BAD_REQUEST", {
							message: "send email verification is not implemented",
						});
					}
					const email = ctx.body.email;
					const otp = generateRandomInteger(6);
					await ctx.context.internalAdapter.createVerificationValue({
						value: otp.toString(),
						identifier: `${ctx.body.for}-otp-${email}`,
						expiresAt: getDate(5 * 60, "sec"),
					});
					await options?.sendEmailVerification(email, otp.toString());
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
					if (!verificationValue || verificationValue.expiresAt > new Date()) {
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
					await ctx.context.internalAdapter.updateUser(user.user.id, {
						email,
						isVerified: true,
					});
					return ctx.json({
						success: true,
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
							`sign-in-verification-otp-${email}`,
						);
					if (!verificationValue || verificationValue.expiresAt > new Date()) {
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
					await setSessionCookie(ctx, session.id);
					return ctx.json({
						session,
						user,
					});
				},
			),
		},
	} satisfies BetterAuthPlugin;
};
