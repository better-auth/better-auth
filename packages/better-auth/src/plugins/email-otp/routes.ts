import { createAuthEndpoint } from "@better-auth/core/api";
import { BASE_ERROR_CODES } from "@better-auth/core/error";
import { defineErrorCodes } from "@better-auth/core/utils";
import * as z from "zod";
import { APIError, getSessionFromCtx } from "../../api";
import { setCookieCache, setSessionCookie } from "../../cookies";
import { generateRandomString, symmetricDecrypt } from "../../crypto";
import { getDate } from "../../utils/date";
import { storeOTP, verifyStoredOTP } from "./otp-token";
import type { EmailOTPOptions } from "./types";
import { splitAtLastColon } from "./utils";

const types = ["email-verification", "sign-in", "forget-password"] as const;

type WithRequired<T, K extends keyof T> = T & { [P in K]-?: T[P] };

type RequiredEmailOTPOptions = WithRequired<
	EmailOTPOptions,
	"expiresIn" | "generateOTP" | "storeOTP"
>;

export const ERROR_CODES = defineErrorCodes({
	OTP_EXPIRED: "OTP expired",
	INVALID_OTP: "Invalid OTP",
	TOO_MANY_ATTEMPTS: "Too many attempts",
});

const sendVerificationOTPBodySchema = z.object({
	email: z.string({}).meta({
		description: "Email address to send the OTP",
	}),
	type: z.enum(types).meta({
		description: "Type of the OTP",
	}),
});

/**
 * ### Endpoint
 *
 * POST `/email-otp/send-verification-otp`
 *
 * ### API Methods
 *
 * **server:**
 * `auth.api.sendVerificationOTP`
 *
 * **client:**
 * `authClient.emailOtp.sendVerificationOtp`
 *
 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/email-otp#api-method-email-otp-send-verification-otp)
 */
export const sendVerificationOTP = (opts: RequiredEmailOTPOptions) =>
	createAuthEndpoint(
		"/email-otp/send-verification-otp",
		{
			method: "POST",
			body: sendVerificationOTPBodySchema,
			metadata: {
				openapi: {
					operationId: "sendEmailVerificationOTP",
					description: "Send a verification OTP to an email",
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
			if (!opts?.sendVerificationOTP) {
				ctx.context.logger.error("send email verification is not implemented");
				throw new APIError("BAD_REQUEST", {
					message: "send email verification is not implemented",
				});
			}
			const email = ctx.body.email.toLowerCase();
			const isValidEmail = z.email().safeParse(email);
			if (!isValidEmail.success) {
				throw ctx.error("BAD_REQUEST", {
					message: BASE_ERROR_CODES.INVALID_EMAIL,
				});
			}
			let otp =
				opts.generateOTP({ email, type: ctx.body.type }, ctx) ||
				defaultOTPGenerator(opts);

			let storedOTP = await storeOTP(ctx, opts, otp);

			await ctx.context.internalAdapter
				.createVerificationValue({
					value: `${storedOTP}:0`,
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
						value: `${storedOTP}:0`,
						identifier: `${ctx.body.type}-otp-${email}`,
						expiresAt: getDate(opts.expiresIn, "sec"),
					});
				});
			const user = await ctx.context.internalAdapter.findUserByEmail(email);
			if (!user) {
				if (ctx.body.type === "sign-in" && !opts.disableSignUp) {
					// allow
				} else {
					await ctx.context.internalAdapter.deleteVerificationByIdentifier(
						`${ctx.body.type}-otp-${email}`,
					);
					return ctx.json({
						success: true,
					});
				}
			}

			await opts.sendVerificationOTP(
				{
					email,
					otp,
					type: ctx.body.type,
				},
				ctx,
			);
			return ctx.json({
				success: true,
			});
		},
	);

const createVerificationOTPBodySchema = z.object({
	email: z.string({}).meta({
		description: "Email address to send the OTP",
	}),
	type: z.enum(types).meta({
		required: true,
		description: "Type of the OTP",
	}),
});

export const createVerificationOTP = (opts: RequiredEmailOTPOptions) =>
	createAuthEndpoint(
		"/email-otp/create-verification-otp",
		{
			method: "POST",
			body: createVerificationOTPBodySchema,
			metadata: {
				SERVER_ONLY: true,
				openapi: {
					operationId: "createEmailVerificationOTP",
					description: "Create a verification OTP for an email",
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
			const email = ctx.body.email.toLowerCase();
			const otp =
				opts.generateOTP({ email, type: ctx.body.type }, ctx) ||
				defaultOTPGenerator(opts);
			let storedOTP = await storeOTP(ctx, opts, otp);
			await ctx.context.internalAdapter.createVerificationValue({
				value: `${storedOTP}:0`,
				identifier: `${ctx.body.type}-otp-${email}`,
				expiresAt: getDate(opts.expiresIn, "sec"),
			});
			return otp;
		},
	);

const getVerificationOTPBodySchema = z.object({
	email: z.string({}).meta({
		description: "Email address the OTP was sent to",
	}),
	type: z.enum(types).meta({
		required: true,
		description: "Type of the OTP",
	}),
});

/**
 * ### Endpoint
 *
 * GET `/email-otp/get-verification-otp`
 *
 * ### API Methods
 *
 * **server:**
 * `auth.api.getVerificationOTP`
 *
 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/email-otp#api-method-email-otp-get-verification-otp)
 */
export const getVerificationOTP = (opts: RequiredEmailOTPOptions) =>
	createAuthEndpoint(
		"/email-otp/get-verification-otp",
		{
			method: "GET",
			query: getVerificationOTPBodySchema,
			metadata: {
				SERVER_ONLY: true,
				openapi: {
					operationId: "getEmailVerificationOTP",
					description: "Get a verification OTP for an email",
					responses: {
						"200": {
							description: "OTP retrieved successfully or not found/expired",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											otp: {
												type: "string",
												nullable: true,
												description:
													"The stored OTP, or null if not found or expired",
											},
										},
										required: ["otp"],
									},
								},
							},
						},
					},
				},
			},
		},
		async (ctx) => {
			const email = ctx.query.email.toLowerCase();
			const verificationValue =
				await ctx.context.internalAdapter.findVerificationValue(
					`${ctx.query.type}-otp-${email}`,
				);
			if (!verificationValue || verificationValue.expiresAt < new Date()) {
				return ctx.json({
					otp: null,
				});
			}
			if (
				opts.storeOTP === "hashed" ||
				(typeof opts.storeOTP === "object" && "hash" in opts.storeOTP)
			) {
				throw new APIError("BAD_REQUEST", {
					message: "OTP is hashed, cannot return the plain text OTP",
				});
			}

			let [storedOtp, _attempts] = splitAtLastColon(verificationValue.value);
			let otp = storedOtp;
			if (opts.storeOTP === "encrypted") {
				otp = await symmetricDecrypt({
					key: ctx.context.secret,
					data: storedOtp,
				});
			}

			if (typeof opts.storeOTP === "object" && "decrypt" in opts.storeOTP) {
				otp = await opts.storeOTP.decrypt(storedOtp);
			}

			return ctx.json({
				otp,
			});
		},
	);

const checkVerificationOTPBodySchema = z.object({
	email: z.string().meta({
		description: "Email address the OTP was sent to",
	}),
	type: z.enum(types).meta({
		required: true,
		description: "Type of the OTP",
	}),
	otp: z.string().meta({
		required: true,
		description: "OTP to verify",
	}),
});

/**
 * ### Endpoint
 *
 * GET `/email-otp/check-verification-otp`
 *
 * ### API Methods
 *
 * **server:**
 * `auth.api.checkVerificationOTP`
 *
 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/email-otp#api-method-email-otp-check-verification-otp)
 */
export const checkVerificationOTP = (opts: RequiredEmailOTPOptions) =>
	createAuthEndpoint(
		"/email-otp/check-verification-otp",
		{
			method: "POST",
			body: checkVerificationOTPBodySchema,
			metadata: {
				openapi: {
					operationId: "verifyEmailWithOTP",
					description: "Verify an email with an OTP",
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
			const email = ctx.body.email.toLowerCase();
			const isValidEmail = z.email().safeParse(email);
			if (!isValidEmail.success) {
				throw new APIError("BAD_REQUEST", {
					message: BASE_ERROR_CODES.INVALID_EMAIL,
				});
			}
			const user = await ctx.context.internalAdapter.findUserByEmail(email);
			if (!user) {
				throw new APIError("BAD_REQUEST", {
					message: BASE_ERROR_CODES.USER_NOT_FOUND,
				});
			}
			const verificationValue =
				await ctx.context.internalAdapter.findVerificationValue(
					`${ctx.body.type}-otp-${email}`,
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

			const [otpValue, attempts] = splitAtLastColon(verificationValue.value);
			const allowedAttempts = opts?.allowedAttempts || 3;
			if (attempts && parseInt(attempts) >= allowedAttempts) {
				await ctx.context.internalAdapter.deleteVerificationValue(
					verificationValue.id,
				);
				throw new APIError("FORBIDDEN", {
					message: ERROR_CODES.TOO_MANY_ATTEMPTS,
				});
			}
			const verified = await verifyStoredOTP(ctx, opts, otpValue, ctx.body.otp);
			if (!verified) {
				await ctx.context.internalAdapter.updateVerificationValue(
					verificationValue.id,
					{
						value: `${otpValue}:${parseInt(attempts || "0") + 1}`,
					},
				);
				throw new APIError("BAD_REQUEST", {
					message: ERROR_CODES.INVALID_OTP,
				});
			}
			return ctx.json({
				success: true,
			});
		},
	);

const verifyEmailOTPBodySchema = z.object({
	email: z.string({}).meta({
		description: "Email address to verify",
	}),
	otp: z.string().meta({
		required: true,
		description: "OTP to verify",
	}),
});

/**
 * ### Endpoint
 *
 * POST `/email-otp/verify-email`
 *
 * ### API Methods
 *
 * **server:**
 * `auth.api.verifyEmailOTP`
 *
 * **client:**
 * `authClient.emailOtp.verifyEmail`
 *
 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/email-otp#api-method-email-otp-verify-email)
 */
export const verifyEmailOTP = (opts: RequiredEmailOTPOptions) =>
	createAuthEndpoint(
		"/email-otp/verify-email",
		{
			method: "POST",
			body: verifyEmailOTPBodySchema,
			metadata: {
				openapi: {
					description: "Verify email with OTP",
					responses: {
						200: {
							description: "Success",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											status: {
												type: "boolean",
												description:
													"Indicates if the verification was successful",
												enum: [true],
											},
											token: {
												type: "string",
												nullable: true,
												description:
													"Session token if autoSignInAfterVerification is enabled, otherwise null",
											},
											user: {
												$ref: "#/components/schemas/User",
											},
										},
										required: ["status", "token", "user"],
									},
								},
							},
						},
					},
				},
			},
		},
		async (ctx) => {
			const email = ctx.body.email.toLowerCase();
			const isValidEmail = z.email().safeParse(email);
			if (!isValidEmail.success) {
				throw new APIError("BAD_REQUEST", {
					message: BASE_ERROR_CODES.INVALID_EMAIL,
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
				throw new APIError("BAD_REQUEST", {
					message: ERROR_CODES.OTP_EXPIRED,
				});
			}

			const [otpValue, attempts] = splitAtLastColon(verificationValue.value);
			const allowedAttempts = opts?.allowedAttempts || 3;
			if (attempts && parseInt(attempts) >= allowedAttempts) {
				await ctx.context.internalAdapter.deleteVerificationValue(
					verificationValue.id,
				);
				throw new APIError("FORBIDDEN", {
					message: ERROR_CODES.TOO_MANY_ATTEMPTS,
				});
			}
			const verified = await verifyStoredOTP(ctx, opts, otpValue, ctx.body.otp);
			if (!verified) {
				await ctx.context.internalAdapter.updateVerificationValue(
					verificationValue.id,
					{
						value: `${otpValue}:${parseInt(attempts || "0") + 1}`,
					},
				);
				throw new APIError("BAD_REQUEST", {
					message: ERROR_CODES.INVALID_OTP,
				});
			}
			await ctx.context.internalAdapter.deleteVerificationValue(
				verificationValue.id,
			);
			const user = await ctx.context.internalAdapter.findUserByEmail(email);
			if (!user) {
				/**
				 * safe to leak the existence of a user, given the user has already the OTP from the
				 * email
				 */
				throw new APIError("BAD_REQUEST", {
					message: BASE_ERROR_CODES.USER_NOT_FOUND,
				});
			}
			const updatedUser = await ctx.context.internalAdapter.updateUser(
				user.user.id,
				{
					email,
					emailVerified: true,
				},
			);
			await ctx.context.options.emailVerification?.onEmailVerification?.(
				updatedUser,
				ctx.request,
			);

			if (ctx.context.options.emailVerification?.autoSignInAfterVerification) {
				const session = await ctx.context.internalAdapter.createSession(
					updatedUser.id,
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
			const currentSession = await getSessionFromCtx(ctx);
			if (currentSession && updatedUser.emailVerified) {
				const dontRememberMeCookie = await ctx.getSignedCookie(
					ctx.context.authCookies.dontRememberToken.name,
					ctx.context.secret,
				);
				await setCookieCache(
					ctx,
					{
						session: currentSession.session,
						user: {
							...currentSession.user,
							emailVerified: true,
						},
					},
					!!dontRememberMeCookie,
				);
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
	);

const signInEmailOTPBodySchema = z.object({
	email: z.string({}).meta({
		description: "Email address to sign in",
	}),
	otp: z.string().meta({
		required: true,
		description: "OTP sent to the email",
	}),
});

/**
 * ### Endpoint
 *
 * POST `/sign-in/email-otp`
 *
 * ### API Methods
 *
 * **server:**
 * `auth.api.signInEmailOTP`
 *
 * **client:**
 * `authClient.signIn.emailOtp`
 *
 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/email-otp#api-method-sign-in-email-otp)
 */
export const signInEmailOTP = (opts: RequiredEmailOTPOptions) =>
	createAuthEndpoint(
		"/sign-in/email-otp",
		{
			method: "POST",
			body: signInEmailOTPBodySchema,
			metadata: {
				openapi: {
					operationId: "signInWithEmailOTP",
					description: "Sign in with email and OTP",
					responses: {
						200: {
							description: "Success",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											token: {
												type: "string",
												description:
													"Session token for the authenticated session",
											},
											user: {
												$ref: "#/components/schemas/User",
											},
										},
										required: ["token", "user"],
									},
								},
							},
						},
					},
				},
			},
		},
		async (ctx) => {
			const email = ctx.body.email.toLowerCase();
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
				throw new APIError("BAD_REQUEST", {
					message: ERROR_CODES.OTP_EXPIRED,
				});
			}
			const [otpValue, attempts] = splitAtLastColon(verificationValue.value);
			const allowedAttempts = opts?.allowedAttempts || 3;
			if (attempts && parseInt(attempts) >= allowedAttempts) {
				await ctx.context.internalAdapter.deleteVerificationValue(
					verificationValue.id,
				);
				throw new APIError("FORBIDDEN", {
					message: ERROR_CODES.TOO_MANY_ATTEMPTS,
				});
			}
			const verified = await verifyStoredOTP(ctx, opts, otpValue, ctx.body.otp);
			if (!verified) {
				await ctx.context.internalAdapter.updateVerificationValue(
					verificationValue.id,
					{
						value: `${otpValue}:${parseInt(attempts || "0") + 1}`,
					},
				);
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
						message: BASE_ERROR_CODES.USER_NOT_FOUND,
					});
				}
				const newUser = await ctx.context.internalAdapter.createUser({
					email,
					emailVerified: true,
					name: "",
				});
				const session = await ctx.context.internalAdapter.createSession(
					newUser.id,
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
	);

const forgetPasswordEmailOTPBodySchema = z.object({
	email: z.string().meta({
		description: "Email address to send the OTP",
	}),
});

/**
 * ### Endpoint
 *
 * POST `/forget-password/email-otp`
 *
 * ### API Methods
 *
 * **server:**
 * `auth.api.forgetPasswordEmailOTP`
 *
 * **client:**
 * `authClient.forgetPassword.emailOtp`
 *
 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/email-otp#api-method-forget-password-email-otp)
 */
export const forgetPasswordEmailOTP = (opts: RequiredEmailOTPOptions) =>
	createAuthEndpoint(
		"/forget-password/email-otp",
		{
			method: "POST",
			body: forgetPasswordEmailOTPBodySchema,
			metadata: {
				openapi: {
					operationId: "forgetPasswordWithEmailOTP",
					description: "Forget password with email and OTP",
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
												description:
													"Indicates if the OTP was sent successfully",
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
			const otp =
				opts.generateOTP({ email, type: "forget-password" }, ctx) ||
				defaultOTPGenerator(opts);
			let storedOTP = await storeOTP(ctx, opts, otp);
			await ctx.context.internalAdapter.createVerificationValue({
				value: `${storedOTP}:0`,
				identifier: `forget-password-otp-${email}`,
				expiresAt: getDate(opts.expiresIn, "sec"),
			});
			const user = await ctx.context.internalAdapter.findUserByEmail(email);
			if (!user) {
				await ctx.context.internalAdapter.deleteVerificationByIdentifier(
					`forget-password-otp-${email}`,
				);
				return ctx.json({
					success: true,
				});
			}
			await opts
				.sendVerificationOTP(
					{
						email,
						otp,
						type: "forget-password",
					},
					ctx,
				)
				.catch((e) => {
					ctx.context.logger.error("Failed to send OTP", e);
				});
			return ctx.json({
				success: true,
			});
		},
	);

const resetPasswordEmailOTPBodySchema = z.object({
	email: z.string().meta({
		description: "Email address to reset the password",
	}),
	otp: z.string().meta({
		description: "OTP sent to the email",
	}),
	password: z.string().meta({
		description: "New password",
	}),
});

/**
 * ### Endpoint
 *
 * POST `/email-otp/reset-password`
 *
 * ### API Methods
 *
 * **server:**
 * `auth.api.resetPasswordEmailOTP`
 *
 * **client:**
 * `authClient.emailOtp.resetPassword`
 *
 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/email-otp#api-method-email-otp-reset-password)
 */
export const resetPasswordEmailOTP = (opts: RequiredEmailOTPOptions) =>
	createAuthEndpoint(
		"/email-otp/reset-password",
		{
			method: "POST",
			body: resetPasswordEmailOTPBodySchema,
			metadata: {
				openapi: {
					operationId: "resetPasswordWithEmailOTP",
					description: "Reset password with email and OTP",
					responses: {
						200: {
							description: "Success",
							contnt: {
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
			const [otpValue, attempts] = splitAtLastColon(verificationValue.value);
			const allowedAttempts = opts?.allowedAttempts || 3;
			if (attempts && parseInt(attempts) >= allowedAttempts) {
				await ctx.context.internalAdapter.deleteVerificationValue(
					verificationValue.id,
				);
				throw new APIError("FORBIDDEN", {
					message: ERROR_CODES.TOO_MANY_ATTEMPTS,
				});
			}
			const verified = await verifyStoredOTP(ctx, opts, otpValue, ctx.body.otp);
			if (!verified) {
				await ctx.context.internalAdapter.updateVerificationValue(
					verificationValue.id,
					{
						value: `${otpValue}:${parseInt(attempts || "0") + 1}`,
					},
				);
				throw new APIError("BAD_REQUEST", {
					message: ERROR_CODES.INVALID_OTP,
				});
			}
			await ctx.context.internalAdapter.deleteVerificationValue(
				verificationValue.id,
			);
			const user = await ctx.context.internalAdapter.findUserByEmail(email, {
				includeAccounts: true,
			});
			if (!user) {
				throw new APIError("BAD_REQUEST", {
					message: BASE_ERROR_CODES.USER_NOT_FOUND,
				});
			}
			const minPasswordLength = ctx.context.password.config.minPasswordLength;
			if (ctx.body.password.length < minPasswordLength) {
				throw new APIError("BAD_REQUEST", {
					message: BASE_ERROR_CODES.PASSWORD_TOO_SHORT,
				});
			}
			const maxPasswordLength = ctx.context.password.config.maxPasswordLength;
			if (ctx.body.password.length > maxPasswordLength) {
				throw new APIError("BAD_REQUEST", {
					message: BASE_ERROR_CODES.PASSWORD_TOO_LONG,
				});
			}
			const passwordHash = await ctx.context.password.hash(ctx.body.password);
			let account = user.accounts?.find(
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

			if (ctx.context.options.emailAndPassword?.onPasswordReset) {
				await ctx.context.options.emailAndPassword.onPasswordReset(
					{
						user: user.user,
					},
					ctx.request,
				);
			}

			if (!user.user.emailVerified) {
				await ctx.context.internalAdapter.updateUser(user.user.id, {
					emailVerified: true,
				});
			}

			if (ctx.context.options.emailAndPassword?.revokeSessionsOnPasswordReset) {
				await ctx.context.internalAdapter.deleteSessions(user.user.id);
			}
			return ctx.json({
				success: true,
			});
		},
	);

const defaultOTPGenerator = (options: EmailOTPOptions) =>
	generateRandomString(options.otpLength ?? 6, "0-9");
