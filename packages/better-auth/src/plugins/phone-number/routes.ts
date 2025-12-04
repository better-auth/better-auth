import { createAuthEndpoint } from "@better-auth/core/api";
import { BASE_ERROR_CODES } from "@better-auth/core/error";
import { APIError } from "better-call";
import * as z from "zod";
import { getSessionFromCtx } from "../../api";
import { setSessionCookie } from "../../cookies";
import { generateRandomString } from "../../crypto/random";
import type { User } from "../../types";
import { getDate } from "../../utils/date";
import { PHONE_NUMBER_ERROR_CODES } from "./error-codes";
import type { PhoneNumberOptions, UserWithPhoneNumber } from "./types";

export type RequiredPhoneNumberOptions = PhoneNumberOptions & {
	expiresIn: number;
	otpLength: number;
	phoneNumber: string;
	phoneNumberVerified: string;
	code: string;
	createdAt: string;
};

const signInPhoneNumberBodySchema = z.object({
	phoneNumber: z.string().meta({
		description: 'Phone number to sign in. Eg: "+1234567890"',
	}),
	password: z.string().meta({
		description: "Password to use for sign in.",
	}),
	rememberMe: z
		.boolean()
		.meta({
			description: "Remember the session. Eg: true",
		})
		.optional(),
});

/**
 * ### Endpoint
 *
 * POST `/sign-in/phone-number`
 *
 * ### API Methods
 *
 * **server:**
 * `auth.api.signInPhoneNumber`
 *
 * **client:**
 * `authClient.signIn.phoneNumber`
 *
 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/phone-number#api-method-sign-in-phone-number)
 */
export const signInPhoneNumber = (opts: RequiredPhoneNumberOptions) =>
	createAuthEndpoint(
		"/sign-in/phone-number",
		{
			method: "POST",
			body: signInPhoneNumberBodySchema,
			metadata: {
				openapi: {
					summary: "Sign in with phone number",
					description: "Use this endpoint to sign in with phone number",
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
						400: {
							description: "Invalid phone number or password",
						},
					},
				},
			},
		},
		async (ctx) => {
			const { password, phoneNumber } = ctx.body;

			if (opts.phoneNumberValidator) {
				const isValidNumber = await opts.phoneNumberValidator(
					ctx.body.phoneNumber,
				);
				if (!isValidNumber) {
					throw new APIError("BAD_REQUEST", {
						message: PHONE_NUMBER_ERROR_CODES.INVALID_PHONE_NUMBER,
					});
				}
			}

			const user = await ctx.context.adapter.findOne<UserWithPhoneNumber>({
				model: "user",
				where: [
					{
						field: "phoneNumber",
						value: phoneNumber,
					},
				],
			});
			if (!user) {
				throw new APIError("UNAUTHORIZED", {
					message: PHONE_NUMBER_ERROR_CODES.INVALID_PHONE_NUMBER_OR_PASSWORD,
				});
			}
			if (opts.requireVerification) {
				if (!user.phoneNumberVerified) {
					const otp = generateOTP(opts.otpLength);
					await ctx.context.internalAdapter.createVerificationValue({
						value: otp,
						identifier: phoneNumber,
						expiresAt: getDate(opts.expiresIn, "sec"),
					});
					await opts.sendOTP?.(
						{
							phoneNumber,
							code: otp,
						},
						ctx,
					);
					throw new APIError("UNAUTHORIZED", {
						message: PHONE_NUMBER_ERROR_CODES.PHONE_NUMBER_NOT_VERIFIED,
					});
				}
			}
			const accounts = await ctx.context.internalAdapter.findAccountByUserId(
				user.id,
			);
			const credentialAccount = accounts.find(
				(a) => a.providerId === "credential",
			);
			if (!credentialAccount) {
				ctx.context.logger.error("Credential account not found", {
					phoneNumber,
				});
				throw new APIError("UNAUTHORIZED", {
					message: PHONE_NUMBER_ERROR_CODES.INVALID_PHONE_NUMBER_OR_PASSWORD,
				});
			}
			const currentPassword = credentialAccount?.password;
			if (!currentPassword) {
				ctx.context.logger.error("Password not found", { phoneNumber });
				throw new APIError("UNAUTHORIZED", {
					message: PHONE_NUMBER_ERROR_CODES.UNEXPECTED_ERROR,
				});
			}
			const validPassword = await ctx.context.password.verify({
				hash: currentPassword,
				password,
			});
			if (!validPassword) {
				ctx.context.logger.error("Invalid password");
				throw new APIError("UNAUTHORIZED", {
					message: PHONE_NUMBER_ERROR_CODES.INVALID_PHONE_NUMBER_OR_PASSWORD,
				});
			}
			const session = await ctx.context.internalAdapter.createSession(
				user.id,
				ctx.body.rememberMe === false,
			);
			if (!session) {
				ctx.context.logger.error("Failed to create session");
				throw new APIError("UNAUTHORIZED", {
					message: BASE_ERROR_CODES.FAILED_TO_CREATE_SESSION,
				});
			}

			await setSessionCookie(
				ctx,
				{
					session,
					user: user,
				},
				ctx.body.rememberMe === false,
			);
			return ctx.json({
				token: session.token,
				user: {
					id: user.id,
					email: user.email,
					emailVerified: user.emailVerified,
					name: user.name,
					image: user.image,
					phoneNumber: user.phoneNumber,
					phoneNumberVerified: user.phoneNumberVerified,
					createdAt: user.createdAt,
					updatedAt: user.updatedAt,
				} as UserWithPhoneNumber,
			});
		},
	);

const sendPhoneNumberOTPBodySchema = z.object({
	phoneNumber: z.string().meta({
		description: 'Phone number to send OTP. Eg: "+1234567890"',
	}),
});

/**
 * ### Endpoint
 *
 * POST `/phone-number/send-otp`
 *
 * ### API Methods
 *
 * **server:**
 * `auth.api.sendPhoneNumberOTP`
 *
 * **client:**
 * `authClient.phoneNumber.sendOtp`
 *
 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/phone-number#api-method-phone-number-send-otp)
 */
export const sendPhoneNumberOTP = (opts: RequiredPhoneNumberOptions) =>
	createAuthEndpoint(
		"/phone-number/send-otp",
		{
			method: "POST",
			body: sendPhoneNumberOTPBodySchema,
			metadata: {
				openapi: {
					summary: "Send OTP to phone number",
					description: "Use this endpoint to send OTP to phone number",
					responses: {
						200: {
							description: "Success",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											message: {
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
			if (!opts?.sendOTP) {
				ctx.context.logger.warn("sendOTP not implemented");
				throw new APIError("NOT_IMPLEMENTED", {
					message: PHONE_NUMBER_ERROR_CODES.SEND_OTP_NOT_IMPLEMENTED,
				});
			}

			if (opts.phoneNumberValidator) {
				const isValidNumber = await opts.phoneNumberValidator(
					ctx.body.phoneNumber,
				);
				if (!isValidNumber) {
					throw new APIError("BAD_REQUEST", {
						message: PHONE_NUMBER_ERROR_CODES.INVALID_PHONE_NUMBER,
					});
				}
			}

			const code = generateOTP(opts.otpLength);
			await ctx.context.internalAdapter.createVerificationValue({
				value: `${code}:0`,
				identifier: ctx.body.phoneNumber,
				expiresAt: getDate(opts.expiresIn, "sec"),
			});
			await opts.sendOTP(
				{
					phoneNumber: ctx.body.phoneNumber,
					code,
				},
				ctx,
			);
			return ctx.json({ message: "code sent" });
		},
	);

const verifyPhoneNumberBodySchema = z.object({
	/**
	 * Phone number
	 */
	phoneNumber: z.string().meta({
		description: 'Phone number to verify. Eg: "+1234567890"',
	}),
	/**
	 * OTP code
	 */
	code: z.string().meta({
		description: 'OTP code. Eg: "123456"',
	}),
	/**
	 * Disable session creation after verification
	 * @default false
	 */
	disableSession: z
		.boolean()
		.meta({
			description: "Disable session creation after verification. Eg: false",
		})
		.optional(),
	/**
	 * This checks if there is a session already
	 * and updates the phone number with the provided
	 * phone number
	 */
	updatePhoneNumber: z
		.boolean()
		.meta({
			description:
				"Check if there is a session and update the phone number. Eg: true",
		})
		.optional(),
});

/**
 * ### Endpoint
 *
 * POST `/phone-number/verify`
 *
 * ### API Methods
 *
 * **server:**
 * `auth.api.verifyPhoneNumber`
 *
 * **client:**
 * `authClient.phoneNumber.verify`
 *
 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/phone-number#api-method-phone-number-verify)
 */
export const verifyPhoneNumber = (opts: RequiredPhoneNumberOptions) =>
	createAuthEndpoint(
		"/phone-number/verify",
		{
			method: "POST",
			body: verifyPhoneNumberBodySchema,
			metadata: {
				openapi: {
					summary: "Verify phone number",
					description: "Use this endpoint to verify phone number",
					responses: {
						"200": {
							description: "Phone number verified successfully",
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
													"Session token if session is created, null if disableSession is true or no session is created",
											},
											user: {
												type: "object",
												nullable: true,
												properties: {
													id: {
														type: "string",
														description: "Unique identifier of the user",
													},
													email: {
														type: "string",
														format: "email",
														nullable: true,
														description: "User's email address",
													},
													emailVerified: {
														type: "boolean",
														nullable: true,
														description: "Whether the email is verified",
													},
													name: {
														type: "string",
														nullable: true,
														description: "User's name",
													},
													image: {
														type: "string",
														format: "uri",
														nullable: true,
														description: "User's profile image URL",
													},
													phoneNumber: {
														type: "string",
														description: "User's phone number",
													},
													phoneNumberVerified: {
														type: "boolean",
														description: "Whether the phone number is verified",
													},
													createdAt: {
														type: "string",
														format: "date-time",
														description: "Timestamp when the user was created",
													},
													updatedAt: {
														type: "string",
														format: "date-time",
														description:
															"Timestamp when the user was last updated",
													},
												},
												required: [
													"id",
													"phoneNumber",
													"phoneNumberVerified",
													"createdAt",
													"updatedAt",
												],
												description:
													"User object with phone number details, null if no user is created or found",
											},
										},
										required: ["status"],
									},
								},
							},
						},
						400: {
							description: "Invalid OTP",
						},
					},
				},
			},
		},
		async (ctx) => {
			if (opts?.verifyOTP) {
				// Use custom verifyOTP if provided
				const isValid = await opts.verifyOTP(
					{
						phoneNumber: ctx.body.phoneNumber,
						code: ctx.body.code,
					},
					ctx,
				);

				if (!isValid) {
					throw new APIError("BAD_REQUEST", {
						message: PHONE_NUMBER_ERROR_CODES.INVALID_OTP,
					});
				}

				// Clean up verification value
				const otp = await ctx.context.internalAdapter.findVerificationValue(
					ctx.body.phoneNumber,
				);
				if (otp) {
					await ctx.context.internalAdapter.deleteVerificationValue(otp.id);
				}
			} else {
				// Default internal verification logic
				const otp = await ctx.context.internalAdapter.findVerificationValue(
					ctx.body.phoneNumber,
				);

				if (!otp || otp.expiresAt < new Date()) {
					if (otp && otp.expiresAt < new Date()) {
						throw new APIError("BAD_REQUEST", {
							message: PHONE_NUMBER_ERROR_CODES.OTP_EXPIRED,
						});
					}
					throw new APIError("BAD_REQUEST", {
						message: PHONE_NUMBER_ERROR_CODES.OTP_NOT_FOUND,
					});
				}
				const [otpValue, attempts] = otp.value.split(":");
				const allowedAttempts = opts?.allowedAttempts || 3;
				if (attempts && parseInt(attempts) >= allowedAttempts) {
					await ctx.context.internalAdapter.deleteVerificationValue(otp.id);
					throw new APIError("FORBIDDEN", {
						message: PHONE_NUMBER_ERROR_CODES.TOO_MANY_ATTEMPTS,
					});
				}
				if (otpValue !== ctx.body.code) {
					await ctx.context.internalAdapter.updateVerificationValue(otp.id, {
						value: `${otpValue}:${parseInt(attempts || "0") + 1}`,
					});
					throw new APIError("BAD_REQUEST", {
						message: PHONE_NUMBER_ERROR_CODES.INVALID_OTP,
					});
				}

				await ctx.context.internalAdapter.deleteVerificationValue(otp.id);
			}

			if (ctx.body.updatePhoneNumber) {
				const session = await getSessionFromCtx(ctx);
				if (!session) {
					throw new APIError("UNAUTHORIZED", {
						message: BASE_ERROR_CODES.USER_NOT_FOUND,
					});
				}
				const existingUser =
					await ctx.context.adapter.findMany<UserWithPhoneNumber>({
						model: "user",
						where: [
							{
								field: "phoneNumber",
								value: ctx.body.phoneNumber,
							},
						],
					});
				if (existingUser.length) {
					throw ctx.error("BAD_REQUEST", {
						message: PHONE_NUMBER_ERROR_CODES.PHONE_NUMBER_EXIST,
					});
				}
				let user =
					await ctx.context.internalAdapter.updateUser<UserWithPhoneNumber>(
						session.user.id,
						{
							[opts.phoneNumber]: ctx.body.phoneNumber,
							[opts.phoneNumberVerified]: true,
						},
					);
				return ctx.json({
					status: true,
					token: session.session.token,
					user: {
						id: user.id,
						email: user.email,
						emailVerified: user.emailVerified,
						name: user.name,
						image: user.image,
						phoneNumber: user.phoneNumber,
						phoneNumberVerified: user.phoneNumberVerified,
						createdAt: user.createdAt,
						updatedAt: user.updatedAt,
					} as UserWithPhoneNumber,
				});
			}

			let user = await ctx.context.adapter.findOne<UserWithPhoneNumber>({
				model: "user",
				where: [
					{
						value: ctx.body.phoneNumber,
						field: opts.phoneNumber,
					},
				],
			});
			if (!user) {
				if (opts?.signUpOnVerification) {
					user =
						await ctx.context.internalAdapter.createUser<UserWithPhoneNumber>({
							email: opts.signUpOnVerification.getTempEmail(
								ctx.body.phoneNumber,
							),
							name: opts.signUpOnVerification.getTempName
								? opts.signUpOnVerification.getTempName(ctx.body.phoneNumber)
								: ctx.body.phoneNumber,
							[opts.phoneNumber]: ctx.body.phoneNumber,
							[opts.phoneNumberVerified]: true,
						});
					if (!user) {
						throw new APIError("INTERNAL_SERVER_ERROR", {
							message: BASE_ERROR_CODES.FAILED_TO_CREATE_USER,
						});
					}
				}
			} else {
				user =
					await ctx.context.internalAdapter.updateUser<UserWithPhoneNumber>(
						user.id,
						{
							[opts.phoneNumberVerified]: true,
						},
					);
			}
			if (!user) {
				throw new APIError("INTERNAL_SERVER_ERROR", {
					message: BASE_ERROR_CODES.FAILED_TO_UPDATE_USER,
				});
			}

			await opts?.callbackOnVerification?.(
				{
					phoneNumber: ctx.body.phoneNumber,
					user,
				},
				ctx,
			);

			if (!ctx.body.disableSession) {
				const session = await ctx.context.internalAdapter.createSession(
					user.id,
				);
				if (!session) {
					throw new APIError("INTERNAL_SERVER_ERROR", {
						message: BASE_ERROR_CODES.FAILED_TO_CREATE_SESSION,
					});
				}
				await setSessionCookie(ctx, {
					session,
					user,
				});
				return ctx.json({
					status: true,
					token: session.token,
					user: {
						id: user.id,
						email: user.email,
						emailVerified: user.emailVerified,
						name: user.name,
						image: user.image,
						phoneNumber: user.phoneNumber,
						phoneNumberVerified: user.phoneNumberVerified,
						createdAt: user.createdAt,
						updatedAt: user.updatedAt,
					} as UserWithPhoneNumber,
				});
			}

			return ctx.json({
				status: true,
				token: null,
				user: {
					id: user.id,
					email: user.email,
					emailVerified: user.emailVerified,
					name: user.name,
					image: user.image,
					phoneNumber: user.phoneNumber,
					phoneNumberVerified: user.phoneNumberVerified,
					createdAt: user.createdAt,
					updatedAt: user.updatedAt,
				} as UserWithPhoneNumber,
			});
		},
	);

const requestPasswordResetPhoneNumberBodySchema = z.object({
	phoneNumber: z.string(),
});

export const requestPasswordResetPhoneNumber = (
	opts: RequiredPhoneNumberOptions,
) =>
	createAuthEndpoint(
		"/phone-number/request-password-reset",
		{
			method: "POST",
			body: requestPasswordResetPhoneNumberBodySchema,
			metadata: {
				openapi: {
					description: "Request OTP for password reset via phone number",
					responses: {
						"200": {
							description: "OTP sent successfully for password reset",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											status: {
												type: "boolean",
												description:
													"Indicates if the OTP was sent successfully",
												enum: [true],
											},
										},
										required: ["status"],
									},
								},
							},
						},
					},
				},
			},
		},
		async (ctx) => {
			const user = await ctx.context.adapter.findOne<UserWithPhoneNumber>({
				model: "user",
				where: [
					{
						value: ctx.body.phoneNumber,
						field: opts.phoneNumber,
					},
				],
			});
			if (!user) {
				throw new APIError("BAD_REQUEST", {
					message: PHONE_NUMBER_ERROR_CODES.PHONE_NUMBER_NOT_EXIST,
				});
			}
			const code = generateOTP(opts.otpLength);
			await ctx.context.internalAdapter.createVerificationValue({
				value: `${code}:0`,
				identifier: `${ctx.body.phoneNumber}-request-password-reset`,
				expiresAt: getDate(opts.expiresIn, "sec"),
			});
			await opts?.sendPasswordResetOTP?.(
				{
					phoneNumber: ctx.body.phoneNumber,
					code,
				},
				ctx,
			);
			return ctx.json({
				status: true,
			});
		},
	);

const resetPasswordPhoneNumberBodySchema = z.object({
	otp: z.string().meta({
		description: 'The one time password to reset the password. Eg: "123456"',
	}),
	phoneNumber: z.string().meta({
		description:
			'The phone number to the account which intends to reset the password for. Eg: "+1234567890"',
	}),
	newPassword: z.string().meta({
		description: `The new password. Eg: "new-and-secure-password"`,
	}),
});

export const resetPasswordPhoneNumber = (opts: RequiredPhoneNumberOptions) =>
	createAuthEndpoint(
		"/phone-number/reset-password",
		{
			method: "POST",
			body: resetPasswordPhoneNumberBodySchema,
			metadata: {
				openapi: {
					description: "Reset password using phone number OTP",
					responses: {
						"200": {
							description: "Password reset successfully",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											status: {
												type: "boolean",
												description:
													"Indicates if the password was reset successfully",
												enum: [true],
											},
										},
										required: ["status"],
									},
								},
							},
						},
					},
				},
			},
		},
		async (ctx) => {
			const verification =
				await ctx.context.internalAdapter.findVerificationValue(
					`${ctx.body.phoneNumber}-request-password-reset`,
				);
			if (!verification) {
				throw new APIError("BAD_REQUEST", {
					message: PHONE_NUMBER_ERROR_CODES.OTP_NOT_FOUND,
				});
			}
			if (verification.expiresAt < new Date()) {
				throw new APIError("BAD_REQUEST", {
					message: PHONE_NUMBER_ERROR_CODES.OTP_EXPIRED,
				});
			}
			const [otpValue, attempts] = verification.value.split(":");
			const allowedAttempts = opts?.allowedAttempts || 3;
			if (attempts && parseInt(attempts) >= allowedAttempts) {
				await ctx.context.internalAdapter.deleteVerificationValue(
					verification.id,
				);
				throw new APIError("FORBIDDEN", {
					message: PHONE_NUMBER_ERROR_CODES.TOO_MANY_ATTEMPTS,
				});
			}
			if (ctx.body.otp !== otpValue) {
				await ctx.context.internalAdapter.updateVerificationValue(
					verification.id,
					{
						value: `${otpValue}:${parseInt(attempts || "0") + 1}`,
					},
				);
				throw new APIError("BAD_REQUEST", {
					message: PHONE_NUMBER_ERROR_CODES.INVALID_OTP,
				});
			}
			const user = await ctx.context.adapter.findOne<User>({
				model: "user",
				where: [
					{
						field: "phoneNumber",
						value: ctx.body.phoneNumber,
					},
				],
			});
			if (!user) {
				throw new APIError("BAD_REQUEST", {
					message: PHONE_NUMBER_ERROR_CODES.UNEXPECTED_ERROR,
				});
			}
			const hashedPassword = await ctx.context.password.hash(
				ctx.body.newPassword,
			);
			await ctx.context.internalAdapter.updatePassword(user.id, hashedPassword);
			await ctx.context.internalAdapter.deleteVerificationValue(
				verification.id,
			);
			return ctx.json({
				status: true,
			});
		},
	);

function generateOTP(size: number) {
	return generateRandomString(size, "0-9");
}
