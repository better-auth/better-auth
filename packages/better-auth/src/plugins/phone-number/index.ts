import { z } from "zod";
import { createAuthEndpoint } from "../../api/call";
import type {
	BetterAuthPlugin,
	InferOptionSchema,
	AuthPluginSchema,
} from "../../types/plugins";
import { APIError } from "better-call";
import { mergeSchema } from "../../db/schema";
import { generateRandomString } from "../../crypto/random";
import { getSessionFromCtx } from "../../api";
import { getDate } from "../../utils/date";
import { setSessionCookie } from "../../cookies";
import { BASE_ERROR_CODES } from "../../error/codes";
import type { User } from "../../types";
import { ERROR_CODES } from "./phone-number-error";

export interface UserWithPhoneNumber extends User {
	phoneNumber: string;
	phoneNumberVerified: boolean;
}

function generateOTP(size: number) {
	return generateRandomString(size, "0-9");
}

export interface PhoneNumberOptions {
	/**
	 * Length of the OTP code
	 * @default 6
	 */
	otpLength?: number;
	/**
	 * Send OTP code to the user
	 *
	 * @param phoneNumber
	 * @param code
	 * @returns
	 */
	sendOTP: (
		data: { phoneNumber: string; code: string },
		request?: Request,
	) => Promise<void> | void;
	/**
	 * a callback to send otp on user requesting to reset their password
	 *
	 * @param data - contains phone number and code
	 * @param request - the request object
	 * @returns
	 */
	sendForgetPasswordOTP?: (
		data: { phoneNumber: string; code: string },
		request?: Request,
	) => Promise<void> | void;
	/**
	 * Expiry time of the OTP code in seconds
	 * @default 300
	 */
	expiresIn?: number;
	/**
	 * Function to validate phone number
	 *
	 * by default any string is accepted
	 */
	phoneNumberValidator?: (phoneNumber: string) => boolean | Promise<boolean>;
	/**
	 * Require a phone number verification before signing in
	 *
	 * @default false
	 */
	requireVerification?: boolean;
	/**
	 * Callback when phone number is verified
	 */
	callbackOnVerification?: (
		data: {
			phoneNumber: string;
			user: UserWithPhoneNumber;
		},
		request?: Request,
	) => void | Promise<void>;
	/**
	 * Sign up user after phone number verification
	 *
	 * the user will be signed up with the temporary email
	 * and the phone number will be updated after verification
	 */
	signUpOnVerification?: {
		/**
		 * When a user signs up, a temporary email will be need to be created
		 * to sign up the user. This function should return a temporary email
		 * for the user given the phone number
		 *
		 * @param phoneNumber
		 * @returns string (temporary email)
		 */
		getTempEmail: (phoneNumber: string) => string;
		/**
		 * When a user signs up, a temporary name will be need to be created
		 * to sign up the user. This function should return a temporary name
		 * for the user given the phone number
		 *
		 * @param phoneNumber
		 * @returns string (temporary name)
		 *
		 * @default phoneNumber - the phone number will be used as the name
		 */
		getTempName?: (phoneNumber: string) => string;
	};
	/**
	 * Custom schema for the admin plugin
	 */
	schema?: InferOptionSchema<typeof schema>;
	/**
	 * Allowed attempts for the OTP code
	 * @default 3
	 */
	allowedAttempts?: number;
}

export const phoneNumber = (options?: PhoneNumberOptions) => {
	const opts = {
		expiresIn: options?.expiresIn || 300,
		otpLength: options?.otpLength || 6,
		...options,
		phoneNumber: "phoneNumber",
		phoneNumberVerified: "phoneNumberVerified",
		code: "code",
		createdAt: "createdAt",
	};

	return {
		id: "phone-number",
		endpoints: {
			signInPhoneNumber: createAuthEndpoint(
				"/sign-in/phone-number",
				{
					method: "POST",
					body: z.object({
						phoneNumber: z.string({
							description: "Phone number to sign in",
						}),
						password: z.string({
							description: "Password to use for sign in",
						}),
						rememberMe: z
							.boolean({
								description: "Remember the session",
							})
							.optional(),
					}),
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
								message: ERROR_CODES.INVALID_PHONE_NUMBER,
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
							message: ERROR_CODES.INVALID_PHONE_NUMBER_OR_PASSWORD,
						});
					}
					if (opts.requireVerification) {
						if (!user.phoneNumberVerified) {
							const otp = generateOTP(opts.otpLength);
							await ctx.context.internalAdapter.createVerificationValue(
								{
									value: otp,
									identifier: phoneNumber,
									expiresAt: getDate(opts.expiresIn, "sec"),
								},
								ctx,
							);
							await opts.sendOTP?.(
								{
									phoneNumber,
									code: otp,
								},
								ctx.request,
							);
							throw new APIError("UNAUTHORIZED", {
								message: ERROR_CODES.PHONE_NUMBER_NOT_VERIFIED,
							});
						}
					}
					const accounts =
						await ctx.context.internalAdapter.findAccountByUserId(user.id);
					const credentialAccount = accounts.find(
						(a) => a.providerId === "credential",
					);
					if (!credentialAccount) {
						ctx.context.logger.error("Credential account not found", {
							phoneNumber,
						});
						throw new APIError("UNAUTHORIZED", {
							message: ERROR_CODES.INVALID_PHONE_NUMBER_OR_PASSWORD,
						});
					}
					const currentPassword = credentialAccount?.password;
					if (!currentPassword) {
						ctx.context.logger.error("Password not found", { phoneNumber });
						throw new APIError("UNAUTHORIZED", {
							message: ERROR_CODES.UNEXPECTED_ERROR,
						});
					}
					const validPassword = await ctx.context.password.verify({
						hash: currentPassword,
						password,
					});
					if (!validPassword) {
						ctx.context.logger.error("Invalid password");
						throw new APIError("UNAUTHORIZED", {
							message: ERROR_CODES.INVALID_PHONE_NUMBER_OR_PASSWORD,
						});
					}
					const session = await ctx.context.internalAdapter.createSession(
						user.id,
						ctx,
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
			),
			sendPhoneNumberOTP: createAuthEndpoint(
				"/phone-number/send-otp",
				{
					method: "POST",
					body: z.object({
						phoneNumber: z.string({
							description: "Phone number to send OTP",
						}),
					}),
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
					if (!options?.sendOTP) {
						ctx.context.logger.warn("sendOTP not implemented");
						throw new APIError("NOT_IMPLEMENTED", {
							message: "sendOTP not implemented",
						});
					}

					if (opts.phoneNumberValidator) {
						const isValidNumber = await opts.phoneNumberValidator(
							ctx.body.phoneNumber,
						);
						if (!isValidNumber) {
							throw new APIError("BAD_REQUEST", {
								message: ERROR_CODES.INVALID_PHONE_NUMBER,
							});
						}
					}

					const code = generateOTP(opts.otpLength);
					await ctx.context.internalAdapter.createVerificationValue(
						{
							value: `${code}:0`,
							identifier: ctx.body.phoneNumber,
							expiresAt: getDate(opts.expiresIn, "sec"),
						},
						ctx,
					);
					await options.sendOTP(
						{
							phoneNumber: ctx.body.phoneNumber,
							code,
						},
						ctx.request,
					);
					return ctx.json({ message: "code sent" });
				},
			),
			verifyPhoneNumber: createAuthEndpoint(
				"/phone-number/verify",
				{
					method: "POST",
					body: z.object({
						/**
						 * Phone number
						 */
						phoneNumber: z.string({
							description: "Phone number to verify",
						}),
						/**
						 * OTP code
						 */
						code: z.string({
							description: "OTP code",
						}),
						/**
						 * Disable session creation after verification
						 * @default false
						 */
						disableSession: z
							.boolean({
								description: "Disable session creation after verification",
							})
							.optional(),
						/**
						 * This checks if there is a session already
						 * and updates the phone number with the provided
						 * phone number
						 */
						updatePhoneNumber: z
							.boolean({
								description:
									"Check if there is a session and update the phone number",
							})
							.optional(),
					}),
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
																description:
																	"Whether the phone number is verified",
															},
															createdAt: {
																type: "string",
																format: "date-time",
																description:
																	"Timestamp when the user was created",
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
					const otp = await ctx.context.internalAdapter.findVerificationValue(
						ctx.body.phoneNumber,
					);

					if (!otp || otp.expiresAt < new Date()) {
						if (otp && otp.expiresAt < new Date()) {
							throw new APIError("BAD_REQUEST", {
								message: "OTP expired",
							});
						}
						throw new APIError("BAD_REQUEST", {
							message: ERROR_CODES.OTP_NOT_FOUND,
						});
					}
					const [otpValue, attempts] = otp.value.split(":");
					const allowedAttempts = options?.allowedAttempts || 3;
					if (attempts && parseInt(attempts) >= allowedAttempts) {
						await ctx.context.internalAdapter.deleteVerificationValue(otp.id);
						throw new APIError("FORBIDDEN", {
							message: "Too many attempts",
						});
					}
					if (otpValue !== ctx.body.code) {
						await ctx.context.internalAdapter.updateVerificationValue(otp.id, {
							value: `${otpValue}:${parseInt(attempts || "0") + 1}`,
						});
						throw new APIError("BAD_REQUEST", {
							message: "Invalid OTP",
						});
					}

					await ctx.context.internalAdapter.deleteVerificationValue(otp.id);

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
								message: ERROR_CODES.PHONE_NUMBER_EXIST,
							});
						}
						let user = await ctx.context.internalAdapter.updateUser(
							session.user.id,
							{
								[opts.phoneNumber]: ctx.body.phoneNumber,
								[opts.phoneNumberVerified]: true,
							},
							ctx,
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
						if (options?.signUpOnVerification) {
							user = await ctx.context.internalAdapter.createUser(
								{
									email: options.signUpOnVerification.getTempEmail(
										ctx.body.phoneNumber,
									),
									name: options.signUpOnVerification.getTempName
										? options.signUpOnVerification.getTempName(
												ctx.body.phoneNumber,
											)
										: ctx.body.phoneNumber,
									[opts.phoneNumber]: ctx.body.phoneNumber,
									[opts.phoneNumberVerified]: true,
								},
								ctx,
							);
							if (!user) {
								throw new APIError("INTERNAL_SERVER_ERROR", {
									message: BASE_ERROR_CODES.FAILED_TO_CREATE_USER,
								});
							}
						}
					} else {
						user = await ctx.context.internalAdapter.updateUser(
							user.id,
							{
								[opts.phoneNumberVerified]: true,
							},
							ctx,
						);
					}

					if (!user) {
						return ctx.json(null);
					}

					await options?.callbackOnVerification?.(
						{
							phoneNumber: ctx.body.phoneNumber,
							user,
						},
						ctx.request,
					);

					if (!user) {
						throw new APIError("INTERNAL_SERVER_ERROR", {
							message: BASE_ERROR_CODES.FAILED_TO_UPDATE_USER,
						});
					}

					if (!ctx.body.disableSession) {
						const session = await ctx.context.internalAdapter.createSession(
							user.id,
							ctx,
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
			),
			forgetPasswordPhoneNumber: createAuthEndpoint(
				"/phone-number/forget-password",
				{
					method: "POST",
					body: z.object({
						phoneNumber: z.string(),
					}),
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
							message: "phone number isn't registered",
						});
					}
					const code = generateOTP(opts.otpLength);
					await ctx.context.internalAdapter.createVerificationValue(
						{
							value: `${code}:0`,
							identifier: `${ctx.body.phoneNumber}-forget-password`,
							expiresAt: getDate(opts.expiresIn, "sec"),
						},
						ctx,
					);
					await options?.sendForgetPasswordOTP?.(
						{
							phoneNumber: ctx.body.phoneNumber,
							code,
						},
						ctx.request,
					);
					return ctx.json({
						status: true,
					});
				},
			),
			resetPasswordPhoneNumber: createAuthEndpoint(
				"/phone-number/reset-password",
				{
					method: "POST",
					body: z.object({
						otp: z.string(),
						phoneNumber: z.string(),
						newPassword: z.string(),
					}),
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
							`${ctx.body.phoneNumber}-forget-password`,
						);
					if (!verification) {
						throw new APIError("BAD_REQUEST", {
							message: ERROR_CODES.OTP_NOT_FOUND,
						});
					}
					if (verification.expiresAt < new Date()) {
						throw new APIError("BAD_REQUEST", {
							message: ERROR_CODES.OTP_EXPIRED,
						});
					}
					const [otpValue, attempts] = verification.value.split(":");
					const allowedAttempts = options?.allowedAttempts || 3;
					if (attempts && parseInt(attempts) >= allowedAttempts) {
						await ctx.context.internalAdapter.deleteVerificationValue(
							verification.id,
						);
						throw new APIError("FORBIDDEN", {
							message: "Too many attempts",
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
							message: ERROR_CODES.INVALID_OTP,
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
							message: ERROR_CODES.UNEXPECTED_ERROR,
						});
					}
					const hashedPassword = await ctx.context.password.hash(
						ctx.body.newPassword,
					);
					await ctx.context.internalAdapter.updatePassword(
						user.id,
						hashedPassword,
					);
					return ctx.json({
						status: true,
					});
				},
			),
		},
		schema: mergeSchema(schema, options?.schema),
		rateLimit: [
			{
				pathMatcher(path) {
					return path.startsWith("/phone-number");
				},
				window: 60 * 1000,
				max: 10,
			},
		],
		$ERROR_CODES: ERROR_CODES,
	} satisfies BetterAuthPlugin;
};

const schema = {
	user: {
		fields: {
			phoneNumber: {
				type: "string",
				required: false,
				unique: true,
				sortable: true,
				returned: true,
			},
			phoneNumberVerified: {
				type: "boolean",
				required: false,
				returned: true,
				input: false,
			},
		},
	},
} satisfies AuthPluginSchema;
