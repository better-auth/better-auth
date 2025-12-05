import type { BetterAuthPlugin } from "@better-auth/core";
import { createAuthMiddleware } from "@better-auth/core/api";
import { generateRandomString } from "../../crypto";
import { getDate } from "../../utils/date";
import { getEndpointResponse } from "../../utils/plugin-helper";
import { storeOTP } from "./otp-token";
import {
	checkVerificationOTP,
	createVerificationOTP,
	ERROR_CODES,
	forgetPasswordEmailOTP,
	getVerificationOTP,
	resetPasswordEmailOTP,
	sendVerificationOTP,
	signInEmailOTP,
	verifyEmailOTP,
} from "./routes";
import type { EmailOTPOptions } from "./types";

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

	return {
		id: "email-otp",
		init(ctx) {
			if (!opts.overrideDefaultEmailVerification) {
				return;
			}
			return {
				options: {
					emailVerification: {
						async sendVerificationEmail(data, request) {
							await sendVerificationOTPAction({
								//@ts-expect-error - we need to pass the context
								context: ctx,
								request: request,
								body: {
									email: data.user.email,
									type: "email-verification",
								},
								ctx,
							});
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
			forgetPasswordEmailOTP: forgetPasswordEmailOTP(opts),
			resetPasswordEmailOTP: resetPasswordEmailOTP(opts),
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
								opts.generateOTP({ email, type: ctx.body.type }, ctx) ||
								defaultOTPGenerator(opts);
							let storedOTP = await storeOTP(ctx, opts, otp);
							await ctx.context.internalAdapter.createVerificationValue({
								value: `${storedOTP}:0`,
								identifier: `email-verification-otp-${email}`,
								expiresAt: getDate(opts.expiresIn, "sec"),
							});
							await options.sendVerificationOTP(
								{
									email,
									otp,
									type: "email-verification",
								},
								ctx,
							);
						}
					}),
				},
			],
		},
		$ERROR_CODES: ERROR_CODES,
		rateLimit: [
			{
				pathMatcher(path) {
					return path === "/email-otp/send-verification-otp";
				},
				window: 60,
				max: 3,
			},
			{
				pathMatcher(path) {
					return path === "/email-otp/check-verification-otp";
				},
				window: 60,
				max: 3,
			},
			{
				pathMatcher(path) {
					return path === "/email-otp/verify-email";
				},
				window: 60,
				max: 3,
			},
			{
				pathMatcher(path) {
					return path === "/sign-in/email-otp";
				},
				window: 60,
				max: 3,
			},
		],
	} satisfies BetterAuthPlugin;
};
