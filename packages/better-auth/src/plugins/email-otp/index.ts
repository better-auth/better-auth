import { z } from "zod";
import { APIError, createAuthEndpoint } from "../../api";
import type { BetterAuthPlugin } from "../../types";
import { generateRandomString } from "../../crypto";
import { getDate } from "../../utils/date";
import { setSessionCookie } from "../../cookies";

interface EmailOTPOptions {
	/**
	 * Function to send email verification
	 */
	sendVerificationOTP: (
		data: {
			email: string;
			otp: string;
			type: "sign-in" | "email-verification" | "forget-password";
		},
		request?: Request,
	) => Promise<void>;
	/**
	 * Length of the OTP
	 *
	 * @default 6
	 */
	otpLength?: number;
	/**
	 * Expiry time of the OTP in seconds
	 *
	 * @default 300 (5 minutes)
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

const types = ["email-verification", "sign-in", "forget-password"] as const;

export const emailOTP = (options: EmailOTPOptions) => {
	const opts = {
		expiresIn: 5 * 60,
		otpLength: 6,
		...options,
	};
	const ERROR_CODES = {
		OTP_EXPIRED: "otp expired",
		INVALID_OTP: "invalid otp",
		INVALID_EMAIL: "invalid email",
		USER_NOT_FOUND: "user not found",
	} as const;
	return {
		id: "email-otp",
		endpoints: {
			sendVerificationOTP: createAuthEndpoint(
				"/email-otp/send-verification-otp",
				{
					method: "POST",
					body: z.object({
						email: z.string({
							description: "Email address to send the OTP",
						}),
						type: z.enum(types, {
							description: "Type of the OTP",
						}),
					}),
					metadata: {
						openapi: {
							description: "Send verification OTP",
							responses: {
								200: {
									description: "Success",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													success: {
														type: "boolean",
													},
												},
											},
										},
									},
								},
							},
						},
					},
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
					const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
					if (!emailRegex.test(email)) {
						throw new APIError("BAD_REQUEST", {
							message: ERROR_CODES.INVALID_EMAIL,
						});
					}
					if (ctx.body.type === "forget-password" || opts.disableSignUp) {
						const user =
							await ctx.context.internalAdapter.findUserByEmail(email);
						if (!user) {
							return ctx.json({
								success: true,
							});
						}
					}
					const otp = generateRandomString(opts.otpLength, "0-9");
					await ctx.context.internalAdapter
						.createVerificationValue({
							value: otp,
							identifier: `${ctx.body.type}-otp-${email}`,
							expiresAt: getDate(opts.expiresIn, "sec"),
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
								expiresAt: getDate(opts.expiresIn, "sec"),
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
						email: z.string({
							description: "Email address to send the OTP",
						}),
						type: z.enum(types, {
							description: "Type of the OTP",
						}),
					}),
					metadata: {
						SERVER_ONLY: true,
						openapi: {
							description: "Create verification OTP",
							responses: {
								200: {
									description: "Success",
									content: {
										"application/json": {
											schema: {
												type: "string",
											},
										},
									},
								},
							},
						},
					},
				},
				async (ctx) => {
					const email = ctx.body.email;
					const otp = generateRandomString(opts.otpLength, "0-9");
					await ctx.context.internalAdapter.createVerificationValue({
						value: otp,
						identifier: `${ctx.body.type}-otp-${email}`,
						expiresAt: getDate(opts.expiresIn, "sec"),
					});
					return otp;
				},
			),
			getVerificationOTP: createAuthEndpoint(
				"/email-otp/get-verification-otp",
				{
					method: "GET",
					query: z.object({
						email: z.string({
							description: "Email address to get the OTP",
						}),
						type: z.enum(types),
					}),
					metadata: {
						SERVER_ONLY: true,
						openapi: {
							description: "Get verification OTP",
							responses: {
								200: {
									description: "Success",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													otp: {
														type: "string",
													},
												},
											},
										},
									},
								},
							},
						},
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
						email: z.string({
							description: "Email address to verify",
						}),
						otp: z.string({
							description: "OTP to verify",
						}),
					}),
					metadata: {
						openapi: {
							description: "Verify email OTP",
							responses: {
								200: {
									description: "Success",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													user: {
														$ref: "#/components/schemas/User",
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
				async (ctx) => {
					const email = ctx.body.email;
					const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
					if (!emailRegex.test(email)) {
						throw new APIError("BAD_REQUEST", {
							message: ERROR_CODES.INVALID_EMAIL,
						});
					}
					const verificationValue =
						await ctx.context.internalAdapter.findVerificationValue(
							`email-verification-otp-${email}`,
						);

					if (!verificationValue) {
						throw new APIError("BAD_REQUEST", {
							message: ERROR_CODES.INVALID_OTP,
						});
					}
					if (verificationValue.expiresAt < new Date()) {
						await ctx.context.internalAdapter.deleteVerificationValue(
							verificationValue.id,
						);
						throw new APIError("BAD_REQUEST", {
							message: ERROR_CODES.OTP_EXPIRED,
						});
					}
					const otp = ctx.body.otp;
					if (verificationValue.value !== otp) {
						throw new APIError("BAD_REQUEST", {
							message: ERROR_CODES.INVALID_OTP,
						});
					}
					await ctx.context.internalAdapter.deleteVerificationValue(
						verificationValue.id,
					);
					const user = await ctx.context.internalAdapter.findUserByEmail(email);
					if (!user) {
						throw new APIError("BAD_REQUEST", {
							message: ERROR_CODES.USER_NOT_FOUND,
						});
					}
					const updatedUser = await ctx.context.internalAdapter.updateUser(
						user.user.id,
						{
							email,
							emailVerified: true,
						},
					);

					if (
						ctx.context.options.emailVerification?.autoSignInAfterVerification
					) {
						const session = await ctx.context.internalAdapter.createSession(
							updatedUser.id,
							ctx.request,
						);
						await setSessionCookie(ctx, {
							session,
							user: updatedUser,
						});
						return ctx.json({
							status: true,
							token: session.token,
							user: {
								id: updatedUser.id,
								email: updatedUser.email,
								emailVerified: updatedUser.emailVerified,
								name: updatedUser.name,
								image: updatedUser.image,
								createdAt: updatedUser.createdAt,
								updatedAt: updatedUser.updatedAt,
							},
						});
					}

					return ctx.json({
						status: true,
						token: null,
						user: {
							id: updatedUser.id,
							email: updatedUser.email,
							emailVerified: updatedUser.emailVerified,
							name: updatedUser.name,
							image: updatedUser.image,
							createdAt: updatedUser.createdAt,
							updatedAt: updatedUser.updatedAt,
						},
					});
				},
			),
			signInEmailOTP: createAuthEndpoint(
				"/sign-in/email-otp",
				{
					method: "POST",
					body: z.object({
						email: z.string({
							description: "Email address to sign in",
						}),
						otp: z.string({
							description: "OTP sent to the email",
						}),
					}),
					metadata: {
						openapi: {
							description: "Sign in with email OTP",
							responses: {
								200: {
									description: "Success",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													user: {
														$ref: "#/components/schemas/User",
													},
													session: {
														$ref: "#/components/schemas/Session",
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
				async (ctx) => {
					const email = ctx.body.email;
					const verificationValue =
						await ctx.context.internalAdapter.findVerificationValue(
							`sign-in-otp-${email}`,
						);
					if (!verificationValue) {
						throw new APIError("BAD_REQUEST", {
							message: ERROR_CODES.INVALID_OTP,
						});
					}
					if (verificationValue.expiresAt < new Date()) {
						await ctx.context.internalAdapter.deleteVerificationValue(
							verificationValue.id,
						);
						throw new APIError("BAD_REQUEST", {
							message: ERROR_CODES.OTP_EXPIRED,
						});
					}
					const otp = ctx.body.otp;
					if (verificationValue.value !== otp) {
						throw new APIError("BAD_REQUEST", {
							message: ERROR_CODES.INVALID_OTP,
						});
					}
					await ctx.context.internalAdapter.deleteVerificationValue(
						verificationValue.id,
					);
					const user = await ctx.context.internalAdapter.findUserByEmail(email);
					if (!user) {
						if (opts.disableSignUp) {
							throw new APIError("BAD_REQUEST", {
								message: ERROR_CODES.USER_NOT_FOUND,
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
							token: session.token,
							user: {
								id: newUser.id,
								email: newUser.email,
								emailVerified: newUser.emailVerified,
								name: newUser.name,
								image: newUser.image,
								createdAt: newUser.createdAt,
								updatedAt: newUser.updatedAt,
							},
						});
					}

					if (!user.user.emailVerified) {
						await ctx.context.internalAdapter.updateUser(user.user.id, {
							emailVerified: true,
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
						token: session.token,
						user: {
							id: user.user.id,
							email: user.user.email,
							emailVerified: user.user.emailVerified,
							name: user.user.name,
							image: user.user.image,
							createdAt: user.user.createdAt,
							updatedAt: user.user.updatedAt,
						},
					});
				},
			),
			forgetPasswordEmailOTP: createAuthEndpoint(
				"/forget-password/email-otp",
				{
					method: "POST",
					body: z.object({
						email: z.string({
							description: "Email address to send the OTP",
						}),
					}),
					metadata: {
						openapi: {
							description: "Forget password with email OTP",
							responses: {
								200: {
									description: "Success",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													success: {
														type: "boolean",
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
				async (ctx) => {
					const email = ctx.body.email;
					const user = await ctx.context.internalAdapter.findUserByEmail(email);
					if (!user) {
						throw new APIError("BAD_REQUEST", {
							message: ERROR_CODES.USER_NOT_FOUND,
						});
					}
					const otp = generateRandomString(opts.otpLength, "0-9");
					await ctx.context.internalAdapter.createVerificationValue({
						value: otp,
						identifier: `forget-password-otp-${email}`,
						expiresAt: getDate(opts.expiresIn, "sec"),
					});
					await options.sendVerificationOTP(
						{
							email,
							otp,
							type: "forget-password",
						},
						ctx.request,
					);
					return ctx.json({
						success: true,
					});
				},
			),
			resetPasswordEmailOTP: createAuthEndpoint(
				"/email-otp/reset-password",
				{
					method: "POST",
					body: z.object({
						email: z.string({
							description: "Email address to reset the password",
						}),
						otp: z.string({
							description: "OTP sent to the email",
						}),
						password: z.string({
							description: "New password",
						}),
					}),
					metadata: {
						openapi: {
							description: "Reset password with email OTP",
							responses: {
								200: {
									description: "Success",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													success: {
														type: "boolean",
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
				async (ctx) => {
					const email = ctx.body.email;
					const user = await ctx.context.internalAdapter.findUserByEmail(
						email,
						{
							includeAccounts: true,
						},
					);
					if (!user) {
						throw new APIError("BAD_REQUEST", {
							message: ERROR_CODES.USER_NOT_FOUND,
						});
					}
					const verificationValue =
						await ctx.context.internalAdapter.findVerificationValue(
							`forget-password-otp-${email}`,
						);
					if (!verificationValue) {
						throw new APIError("BAD_REQUEST", {
							message: ERROR_CODES.INVALID_OTP,
						});
					}
					if (verificationValue.expiresAt < new Date()) {
						await ctx.context.internalAdapter.deleteVerificationValue(
							verificationValue.id,
						);
						throw new APIError("BAD_REQUEST", {
							message: ERROR_CODES.OTP_EXPIRED,
						});
					}
					const otp = ctx.body.otp;
					if (verificationValue.value !== otp) {
						throw new APIError("BAD_REQUEST", {
							message: ERROR_CODES.INVALID_OTP,
						});
					}
					await ctx.context.internalAdapter.deleteVerificationValue(
						verificationValue.id,
					);
					const passwordHash = await ctx.context.password.hash(
						ctx.body.password,
					);
					const account = user.accounts.find(
						(account) => account.providerId === "credential",
					);
					if (!account) {
						await ctx.context.internalAdapter.createAccount({
							userId: user.user.id,
							providerId: "credential",
							accountId: user.user.id,
							password: passwordHash,
						});
					} else {
						await ctx.context.internalAdapter.updatePassword(
							user.user.id,
							passwordHash,
						);
					}

					return ctx.json({
						success: true,
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
						const response = ctx.context.returned;
						if (response instanceof APIError) {
							return;
						}
						const email =
							response && "email" in response
								? response.email
								: response instanceof Response
									? response.status === 200
										? ctx.body.email
										: null
									: null;
						if (email) {
							const otp = generateRandomString(opts.otpLength, "0-9");
							await ctx.context.internalAdapter.createVerificationValue({
								value: otp,
								identifier: `email-verification-otp-${email}`,
								expiresAt: getDate(opts.expiresIn, "sec"),
							});
							await options.sendVerificationOTP(
								{
									email,
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
