import type { BetterAuthPlugin } from "@better-auth/core";
import { createAuthMiddleware } from "@better-auth/core/api";
import { fixedWindow } from "@better-auth/rate-limit";
import { generateRandomString } from "../../crypto";
import { getDate } from "../../utils/date";
import { getEndpointResponse } from "../../utils/plugin-helper";
import { PACKAGE_VERSION } from "../../version";
import { EMAIL_OTP_ERROR_CODES } from "./error-codes";
import { storeOTP } from "./otp-token";
import {
	changeEmailEmailOTP,
	checkVerificationOTP,
	createVerificationOTP,
	forgetPasswordEmailOTP,
	getVerificationOTP,
	requestEmailChangeEmailOTP,
	requestPasswordResetEmailOTP,
	resetPasswordEmailOTP,
	sendVerificationOTP,
	signInEmailOTP,
	verifyEmailOTP,
} from "./routes";
import type { EmailOTPOptions } from "./types";
import { toOTPIdentifier } from "./utils";

declare module "@better-auth/core" {
	interface BetterAuthPluginRegistry<AuthOptions, Options> {
		"email-otp": {
			creator: typeof emailOTP;
		};
	}
}

export type { EmailOTPOptions } from "./types";

const defaultOTPGenerator = (options: EmailOTPOptions) =>
	generateRandomString(options.otpLength ?? 6, "0-9");

export const emailOTP = (options: EmailOTPOptions) => {
	const opts = {
		expiresIn: 5 * 60,
		generateOTP: () => defaultOTPGenerator(options),
		storeOTP: "plain",
		...options,
	} satisfies EmailOTPOptions;

	const sendVerificationOTPAction = sendVerificationOTP(opts);
	const rateLimitPolicy = fixedWindow({
		limit: opts.rateLimit?.max || 3,
		windowMs: (opts.rateLimit?.window || 60) * 1_000,
	});

	return {
		id: "email-otp",
		version: PACKAGE_VERSION,
		init(ctx) {
			if (!opts.overrideDefaultEmailVerification) {
				return;
			}
			return {
				options: {
					emailVerification: {
						async sendVerificationEmail(data, request) {
							await ctx.runInBackgroundOrAwait(
								sendVerificationOTPAction({
									context: ctx,
									request: request,
									body: {
										email: data.user.email,
										type: "email-verification",
									},
									//@ts-expect-error
									ctx,
								}),
							);
						},
					},
				},
			};
		},
		endpoints: {
			sendVerificationOTP: sendVerificationOTPAction,
			createVerificationOTP: createVerificationOTP(opts),
			getVerificationOTP: getVerificationOTP(opts),
			checkVerificationOTP: checkVerificationOTP(opts),
			verifyEmailOTP: verifyEmailOTP(opts),
			signInEmailOTP: signInEmailOTP(opts),
			requestPasswordResetEmailOTP: requestPasswordResetEmailOTP(opts),
			forgetPasswordEmailOTP: forgetPasswordEmailOTP(opts),
			resetPasswordEmailOTP: resetPasswordEmailOTP(opts),
			requestEmailChangeEmailOTP: requestEmailChangeEmailOTP(opts),
			changeEmailEmailOTP: changeEmailEmailOTP(opts),
		},
		hooks: {
			after: [
				{
					matcher(context) {
						return !!(
							context.path?.startsWith("/sign-up") &&
							opts.sendVerificationOnSignUp &&
							!opts.overrideDefaultEmailVerification
						);
					},
					handler: createAuthMiddleware(async (ctx) => {
						const response = await getEndpointResponse<{
							user: { email: string };
						}>(ctx);
						const email = response?.user.email;
						if (email) {
							const otp =
								opts.generateOTP({ email, type: "email-verification" }, ctx) ||
								defaultOTPGenerator(opts);
							const storedOTP = await storeOTP(ctx, opts, otp);
							await ctx.context.internalAdapter.createVerificationValue({
								value: `${storedOTP}:0`,
								identifier: toOTPIdentifier("email-verification", email),
								expiresAt: getDate(opts.expiresIn, "sec"),
							});
							await ctx.context.runInBackgroundOrAwait(
								options.sendVerificationOTP(
									{
										email,
										otp,
										type: "email-verification",
									},
									ctx,
								),
							);
						}
					}),
				},
			],
		},

		rateLimit: [
			{
				pathMatcher(path) {
					return path === "/email-otp/send-verification-otp";
				},
				policy: rateLimitPolicy,
			},
			{
				pathMatcher(path) {
					return path === "/email-otp/check-verification-otp";
				},
				policy: rateLimitPolicy,
			},
			{
				pathMatcher(path) {
					return path === "/email-otp/verify-email";
				},
				policy: rateLimitPolicy,
			},
			{
				pathMatcher(path) {
					return path === "/sign-in/email-otp";
				},
				policy: rateLimitPolicy,
			},
			{
				pathMatcher(path) {
					return path === "/email-otp/request-password-reset";
				},
				policy: rateLimitPolicy,
			},
			{
				pathMatcher(path) {
					return path === "/email-otp/reset-password";
				},
				policy: rateLimitPolicy,
			},
			{
				pathMatcher(path) {
					return path === "/forget-password/email-otp";
				},
				policy: rateLimitPolicy,
			},
			{
				pathMatcher(path) {
					return path === "/email-otp/request-email-change";
				},
				policy: rateLimitPolicy,
			},
			{
				pathMatcher(path) {
					return path === "/email-otp/change-email";
				},
				policy: rateLimitPolicy,
			},
		],
		options,
		$ERROR_CODES: EMAIL_OTP_ERROR_CODES,
	} satisfies BetterAuthPlugin;
};
