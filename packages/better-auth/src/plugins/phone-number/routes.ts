import type { GenericEndpointContext } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError, BASE_ERROR_CODES } from "@better-auth/core/error";
import * as z from "zod";
import { getSessionFromCtx } from "../../api";
import { setSessionCookie } from "../../cookies";
import { generateRandomString } from "../../crypto/random";
import type { User } from "../../types";
import { getDate } from "../../utils/date";
import { PHONE_NUMBER_ERROR_CODES } from "./error-codes";
import type { PhoneNumberOptions, UserWithPhoneNumber } from "./types";
import { splitAtLastColon } from "./utils";

export type RequiredPhoneNumberOptions = PhoneNumberOptions & {
	expiresIn: number;
	otpLength: number;
	phoneNumber: string;
	phoneNumberVerified: string;
	code: string;
	createdAt: string;
};

/**
 * Helper function to verify OTP value
 * Returns verification result with error handling
 */
async function verifyOTPValue(
	ctx: GenericEndpointContext,
	identifier: string,
	otp: string,
	opts: RequiredPhoneNumberOptions,
): Promise<{
	valid: boolean;
	verificationValue: Awaited<
		ReturnType<
			typeof ctx.context.internalAdapter.findVerificationValue
		>
	>;
	error?: APIError;
}> {
	const verificationValue =
		await ctx.context.internalAdapter.findVerificationValue(identifier);

	if (!verificationValue) {
		return {
			valid: false,
			verificationValue: null,
			error: APIError.from("BAD_REQUEST", PHONE_NUMBER_ERROR_CODES.OTP_NOT_FOUND),
		};
	}

	if (verificationValue.expiresAt < new Date()) {
		await ctx.context.internalAdapter.deleteVerificationValue(
			verificationValue.id,
		);
		return {
			valid: false,
			verificationValue,
			error: APIError.from("BAD_REQUEST", PHONE_NUMBER_ERROR_CODES.OTP_EXPIRED),
		};
	}

	const [otpValue, attempts] = splitAtLastColon(verificationValue.value);
	const allowedAttempts = opts?.allowedAttempts || 3;

	if (attempts && parseInt(attempts) >= allowedAttempts) {
		await ctx.context.internalAdapter.deleteVerificationValue(
			verificationValue.id,
		);
		return {
			valid: false,
			verificationValue,
			error: APIError.from("FORBIDDEN", PHONE_NUMBER_ERROR_CODES.TOO_MANY_ATTEMPTS),
		};
	}

	if (opts?.verifyOTP) {
		const otpSeparatorIndex = identifier.lastIndexOf("-otp-");
		const phoneNumberFromIdentifier =
			otpSeparatorIndex !== -1
				? identifier.slice(otpSeparatorIndex + 5) || identifier
				: identifier;
		const isValid = await opts.verifyOTP(
			{
				phoneNumber: phoneNumberFromIdentifier,
				code: otp,
			},
			ctx,
		);

		
		if (!isValid) {
			await ctx.context.internalAdapter.updateVerificationValue(
				verificationValue.id,
				{
					value: `${otpValue}:${parseInt(attempts || "0") + 1}`,
				},
			);
		}

		return {
			valid: isValid,
			verificationValue,
			error: isValid
				? undefined
				: APIError.from("BAD_REQUEST", PHONE_NUMBER_ERROR_CODES.INVALID_OTP),
		};
	}

	if (otpValue !== otp) {
		await ctx.context.internalAdapter.updateVerificationValue(
			verificationValue.id,
			{
				value: `${otpValue}:${parseInt(attempts || "0") + 1}`,
			},
		);
		return {
			valid: false,
			verificationValue,
			error: APIError.from("BAD_REQUEST", PHONE_NUMBER_ERROR_CODES.INVALID_OTP),
		};
	}

	return {
		valid: true,
		verificationValue,
	};
}

const types = [
	"phone-number-verification",
	"sign-in",
	"forget-password",
] as const;

const sendVerificationOTPBodySchema = z.object({
	phoneNumber: z.string().meta({
		description: 'Phone number to send the OTP. Eg: "+1234567890"',
	}),
	type: z.enum(types).meta({
		description: "Type of the OTP",
	}),
});

/**
 * ### Endpoint
 *
 * POST `/phone-number/send-verification-otp`
 *
 * ### API Methods
 *
 * **server:**
 * `auth.api.sendPhoneNumberVerificationOTP`
 *
 * **client:**
 * `authClient.phoneNumber.sendVerificationOtp`
 *
 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/phone-number#api-method-phone-number-send-verification-otp)
 */
export const sendPhoneNumberVerificationOTP = (
	opts: RequiredPhoneNumberOptions,
) =>
	createAuthEndpoint(
		"/phone-number/send-verification-otp",
		{
			method: "POST",
			body: sendVerificationOTPBodySchema,
			metadata: {
				openapi: {
					operationId: "sendPhoneNumberVerificationOTP",
					description: "Send a verification OTP to a phone number",
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
			if (!opts?.sendOTP) {
				ctx.context.logger.warn("sendOTP not implemented");
				throw APIError.from(
					"NOT_IMPLEMENTED",
					PHONE_NUMBER_ERROR_CODES.SEND_OTP_NOT_IMPLEMENTED,
				);
			}

			if (opts.phoneNumberValidator) {
				const isValidNumber = await opts.phoneNumberValidator(
					ctx.body.phoneNumber,
				);
				if (!isValidNumber) {
					throw APIError.from(
						"BAD_REQUEST",
						PHONE_NUMBER_ERROR_CODES.INVALID_PHONE_NUMBER,
					);
				}
			}

			const code = generateOTP(opts.otpLength);
			const identifier = `${ctx.body.type}-otp-${ctx.body.phoneNumber}`;

			await ctx.context.internalAdapter
				.createVerificationValue({
					value: `${code}:0`,
					identifier,
					expiresAt: getDate(opts.expiresIn, "sec"),
				})
				.catch(async (error) => {
					await ctx.context.internalAdapter.deleteVerificationByIdentifier(
						identifier,
					);
					await ctx.context.internalAdapter.createVerificationValue({
						value: `${code}:0`,
						identifier,
						expiresAt: getDate(opts.expiresIn, "sec"),
					});
				});


			if (ctx.body.type === "sign-in" && opts.disableSignUp) {
				const user = await ctx.context.adapter.findOne<UserWithPhoneNumber>({
					model: "user",
					where: [
						{
							field: opts.phoneNumber,
							value: ctx.body.phoneNumber,
						},
					],
				});
				if (!user) {
					await ctx.context.internalAdapter.deleteVerificationByIdentifier(
						identifier,
					);
					return ctx.json({
						success: true,
					});
				}
			}

			if (
				ctx.body.type === "forget-password" &&
				opts.sendPasswordResetOTP
			) {
				await ctx.context.runInBackgroundOrAwait(
					opts.sendPasswordResetOTP(
						{
							phoneNumber: ctx.body.phoneNumber,
							code,
							type: "forget-password",
						},
						ctx,
					),
				);
			} else {
				await ctx.context.runInBackgroundOrAwait(
					opts.sendOTP(
						{
							phoneNumber: ctx.body.phoneNumber,
							code,
							type: ctx.body.type,
						},
						ctx,
					),
				);
			}

			return ctx.json({
				success: true,
			});
		},
	);

const checkVerificationOTPBodySchema = z.object({
	phoneNumber: z.string().meta({
		description: "Phone number the OTP was sent to",
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
 * POST `/phone-number/check-verification-otp`
 *
 * ### API Methods
 *
 * **server:**
 * `auth.api.checkPhoneNumberVerificationOTP`
 *
 * **client:**
 * `authClient.phoneNumber.checkVerificationOtp`
 *
 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/phone-number#api-method-phone-number-check-verification-otp)
 */
export const checkPhoneNumberVerificationOTP = (
	opts: RequiredPhoneNumberOptions,
) =>
	createAuthEndpoint(
		"/phone-number/check-verification-otp",
		{
			method: "POST",
			body: checkVerificationOTPBodySchema,
			metadata: {
				openapi: {
					operationId: "checkPhoneNumberVerificationOTP",
					description: "Check if an OTP is valid without performing any action",
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
			const identifier = `${ctx.body.type}-otp-${ctx.body.phoneNumber}`;
			const result = await verifyOTPValue(ctx, identifier, ctx.body.otp, opts);

			if (!result.valid) {
				if (result.error) {
					throw result.error;
				}
				throw APIError.from("BAD_REQUEST", PHONE_NUMBER_ERROR_CODES.INVALID_OTP);
			}

			return ctx.json({
				success: true,
			});
		},
	);

const signInPhoneNumberOTPBodySchema = z.object({
	phoneNumber: z.string().meta({
		description: "Phone number to sign in",
	}),
	otp: z.string().meta({
		required: true,
		description: "OTP sent to the phone number",
	}),
});

/**
 * ### Endpoint
 *
 * POST `/sign-in/phone-number-otp`
 *
 * ### API Methods
 *
 * **server:**
 * `auth.api.signInPhoneNumberOTP`
 *
 * **client:**
 * `authClient.signIn.phoneNumberOtp`
 *
 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/phone-number#api-method-sign-in-phone-number-otp)
 */
export const signInPhoneNumberOTP = (opts: RequiredPhoneNumberOptions) =>
	createAuthEndpoint(
		"/sign-in/phone-number-otp",
		{
			method: "POST",
			body: signInPhoneNumberOTPBodySchema,
			metadata: {
				openapi: {
					operationId: "signInWithPhoneNumberOTP",
					description: "Sign in with phone number and OTP",
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
			const identifier = `sign-in-otp-${ctx.body.phoneNumber}`;
			const result = await verifyOTPValue(ctx, identifier, ctx.body.otp, opts);

			if (!result.valid) {
				if (result.error) {
					throw result.error;
				}
				throw APIError.from("BAD_REQUEST", PHONE_NUMBER_ERROR_CODES.INVALID_OTP);
			}

			
			await ctx.context.internalAdapter.deleteVerificationValue(
				result.verificationValue!.id,
			);

			const user = await ctx.context.adapter.findOne<UserWithPhoneNumber>({
				model: "user",
				where: [
					{
						field: opts.phoneNumber,
						value: ctx.body.phoneNumber,
					},
				],
			});

			if (!user) {
				if (opts.disableSignUp) {
					throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.USER_NOT_FOUND);
				}
				const normalizedPhone = ctx.body.phoneNumber.replace(/[^0-9]/g, "");
				const randomSuffix = generateRandomString(8);
				const tempEmail = `phone-${normalizedPhone}-${randomSuffix}@temp.better-auth.local`;
				const newUser =
					await ctx.context.internalAdapter.createUser<UserWithPhoneNumber>({
						email: tempEmail,
						emailVerified: false,
						name: "",
						[opts.phoneNumber]: ctx.body.phoneNumber,
						[opts.phoneNumberVerified]: true,
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
						phoneNumber: newUser.phoneNumber,
						phoneNumberVerified: newUser.phoneNumberVerified,
						createdAt: newUser.createdAt,
						updatedAt: newUser.updatedAt,
					} as UserWithPhoneNumber,
				});
			}

			if (!user.phoneNumberVerified) {
				await ctx.context.internalAdapter.updateUser<UserWithPhoneNumber>(
					user.id,
					{
						[opts.phoneNumberVerified]: true,
					},
				);
				user.phoneNumberVerified = true;
			}

			const session = await ctx.context.internalAdapter.createSession(user.id);
			await setSessionCookie(ctx, {
				session,
				user,
			});
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

const verifyPhoneNumberNewBodySchema = z.object({
	phoneNumber: z.string().meta({
		description: 'Phone number to verify. Eg: "+1234567890"',
	}),
	otp: z.string().meta({
		required: true,
		description: 'OTP code. Eg: "123456"',
	}),
	updatePhoneNumber: z
		.boolean()
		.meta({
			description:
				"Check if there is a session and update the phone number. Eg: true",
		})
		.optional(),
	disableSession: z
		.boolean()
		.meta({
			description:
				"Set to false to create a session after verification. By default, no session is created. Eg: false",
		})
		.optional(),
});

/**
 * ### Endpoint
 *
 * POST `/phone-number/verify-phone-number`
 *
 * ### API Methods
 *
 * **server:**
 * `auth.api.verifyPhoneNumberNew`
 *
 * **client:**
 * `authClient.phoneNumber.verifyPhoneNumber`
 *
 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/phone-number#api-method-phone-number-verify-phone-number)
 */
export const verifyPhoneNumberNew = (opts: RequiredPhoneNumberOptions) =>
	createAuthEndpoint(
		"/phone-number/verify-phone-number",
		{
			method: "POST",
			body: verifyPhoneNumberNewBodySchema,
			metadata: {
				openapi: {
					summary: "Verify phone number",
					description: "Use this endpoint to verify phone number (does not create session by default)",
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
			const identifier = `phone-number-verification-otp-${ctx.body.phoneNumber}`;
			const result = await verifyOTPValue(ctx, identifier, ctx.body.otp, opts);

			if (!result.valid) {
				if (result.error) {
					throw result.error;
				}
				throw APIError.from("BAD_REQUEST", PHONE_NUMBER_ERROR_CODES.INVALID_OTP);
			}

			await ctx.context.internalAdapter.deleteVerificationValue(
				result.verificationValue!.id,
			);

			if (ctx.body.updatePhoneNumber) {
				const session = await getSessionFromCtx(ctx);
				if (!session) {
					throw APIError.from("UNAUTHORIZED", BASE_ERROR_CODES.USER_NOT_FOUND);
				}
				const existingUser =
					await ctx.context.adapter.findMany<UserWithPhoneNumber>({
						model: "user",
						where: [
							{
								field: opts.phoneNumber,
								value: ctx.body.phoneNumber,
							},
						],
					});
				if (existingUser.length) {
					throw APIError.from(
						"BAD_REQUEST",
						PHONE_NUMBER_ERROR_CODES.PHONE_NUMBER_EXIST,
					);
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
						throw APIError.from(
							"INTERNAL_SERVER_ERROR",
							BASE_ERROR_CODES.FAILED_TO_CREATE_USER,
						);
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
				throw APIError.from(
					"INTERNAL_SERVER_ERROR",
					BASE_ERROR_CODES.FAILED_TO_UPDATE_USER,
				);
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
					throw APIError.from(
						"INTERNAL_SERVER_ERROR",
						BASE_ERROR_CODES.FAILED_TO_CREATE_SESSION,
					);
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
					throw APIError.from(
						"BAD_REQUEST",
						PHONE_NUMBER_ERROR_CODES.INVALID_PHONE_NUMBER,
					);
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
				throw APIError.from(
					"UNAUTHORIZED",
					PHONE_NUMBER_ERROR_CODES.INVALID_PHONE_NUMBER_OR_PASSWORD,
				);
			}
			if (opts.requireVerification) {
				if (!user.phoneNumberVerified) {
					const otp = generateOTP(opts.otpLength);
					await ctx.context.internalAdapter.createVerificationValue({
						value: otp,
						identifier: phoneNumber,
						expiresAt: getDate(opts.expiresIn, "sec"),
					});
					if (opts.sendOTP) {
						await ctx.context.runInBackgroundOrAwait(
							opts.sendOTP(
								{
									phoneNumber,
									code: otp,
								},
								ctx,
							),
						);
					}
					throw APIError.from(
						"UNAUTHORIZED",
						PHONE_NUMBER_ERROR_CODES.PHONE_NUMBER_NOT_VERIFIED,
					);
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
				throw APIError.from(
					"UNAUTHORIZED",
					PHONE_NUMBER_ERROR_CODES.INVALID_PHONE_NUMBER_OR_PASSWORD,
				);
			}
			const currentPassword = credentialAccount?.password;
			if (!currentPassword) {
				ctx.context.logger.error("Password not found", { phoneNumber });
				throw APIError.from(
					"UNAUTHORIZED",
					PHONE_NUMBER_ERROR_CODES.UNEXPECTED_ERROR,
				);
			}
			const validPassword = await ctx.context.password.verify({
				hash: currentPassword,
				password,
			});
			if (!validPassword) {
				ctx.context.logger.error("Invalid password");
				throw APIError.from(
					"UNAUTHORIZED",
					PHONE_NUMBER_ERROR_CODES.INVALID_PHONE_NUMBER_OR_PASSWORD,
				);
			}
			const session = await ctx.context.internalAdapter.createSession(
				user.id,
				ctx.body.rememberMe === false,
			);
			if (!session) {
				ctx.context.logger.error("Failed to create session");
				throw APIError.from(
					"UNAUTHORIZED",
					BASE_ERROR_CODES.FAILED_TO_CREATE_SESSION,
				);
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
 * @deprecated Use `sendPhoneNumberVerificationOTP` with `type: "phone-number-verification"` instead.
 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/phone-number#api-method-phone-number-send-verification-otp)
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
					description: "Use this endpoint to send OTP to phone number (deprecated: use sendVerificationOTP instead)",
					deprecated: true,
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
				throw APIError.from(
					"NOT_IMPLEMENTED",
					PHONE_NUMBER_ERROR_CODES.SEND_OTP_NOT_IMPLEMENTED,
				);
			}

			if (opts.phoneNumberValidator) {
				const isValidNumber = await opts.phoneNumberValidator(
					ctx.body.phoneNumber,
				);
				if (!isValidNumber) {
					throw APIError.from(
						"BAD_REQUEST",
						PHONE_NUMBER_ERROR_CODES.INVALID_PHONE_NUMBER,
					);
				}
			}

			const code = generateOTP(opts.otpLength);
			await ctx.context.internalAdapter.createVerificationValue({
				value: `${code}:0`,
				identifier: ctx.body.phoneNumber,
				expiresAt: getDate(opts.expiresIn, "sec"),
			});
			await ctx.context.runInBackgroundOrAwait(
				opts.sendOTP(
					{
						phoneNumber: ctx.body.phoneNumber,
						code,
						type: "phone-number-verification",
					},
					ctx,
				),
			);
			return ctx.json({ message: "code sent" });
		},
	);

const verifyPhoneNumberBodySchema = z
	.object({
		/**
		 * Phone number
		 */
		phoneNumber: z.string().meta({
			description: 'Phone number to verify. Eg: "+1234567890"',
		}),
		/**
		 * OTP code (deprecated: use `otp` instead)
		 */
		code: z.string().meta({
			description: 'OTP code. Eg: "123456"',
		}).optional(),
		/**
		 * OTP code
		 */
		otp: z.string().meta({
			description: 'OTP code. Eg: "123456"',
		}).optional(),
	/**
	 * Set to false to create a session after verification.
	 * By default, no session is created (matches documentation).
	 * @default undefined (no session)
	 */
	disableSession: z
		.boolean()
		.meta({
			description:
				"Set to false to create a session after verification. By default, no session is created. Eg: false",
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
	})
	.refine((data) => data.code || data.otp, {
		message: "Either 'code' or 'otp' must be provided",
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
 * @deprecated Use `verifyPhoneNumberNew` for verification only, or `signInPhoneNumberOTP` for passwordless sign-in.
 * This endpoint creates a session by default (unless `disableSession: true`), which may be confusing.
 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/phone-number#api-method-phone-number-verify-phone-number)
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
					description: "Use this endpoint to verify phone number (deprecated: use verifyPhoneNumberNew or signInPhoneNumberOTP instead)",
					deprecated: true,
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
			const otpValue = ctx.body.otp || ctx.body.code;
			if (!otpValue) {
				throw APIError.from(
					"BAD_REQUEST",
					PHONE_NUMBER_ERROR_CODES.INVALID_OTP,
				);
			}

			if (opts?.verifyOTP) {
				const isValid = await opts.verifyOTP(
					{
						phoneNumber: ctx.body.phoneNumber,
						code: otpValue,
					},
					ctx,
				);

				if (!isValid) {
					throw APIError.from(
						"BAD_REQUEST",
						PHONE_NUMBER_ERROR_CODES.INVALID_OTP,
					);
				}

				const otp = await ctx.context.internalAdapter.findVerificationValue(
					ctx.body.phoneNumber,
				);
				if (otp) {
					await ctx.context.internalAdapter.deleteVerificationValue(otp.id);
				}
			} else {
				const otp = await ctx.context.internalAdapter.findVerificationValue(
					ctx.body.phoneNumber,
				);

				if (!otp || otp.expiresAt < new Date()) {
					if (otp && otp.expiresAt < new Date()) {
						throw APIError.from(
							"BAD_REQUEST",
							PHONE_NUMBER_ERROR_CODES.OTP_EXPIRED,
						);
					}
					throw APIError.from(
						"BAD_REQUEST",
						PHONE_NUMBER_ERROR_CODES.OTP_NOT_FOUND,
					);
				}
				const [storedOtpValue, attempts] = otp.value.split(":");
				const allowedAttempts = opts?.allowedAttempts || 3;
				if (attempts && parseInt(attempts) >= allowedAttempts) {
					await ctx.context.internalAdapter.deleteVerificationValue(otp.id);
					throw APIError.from(
						"FORBIDDEN",
						PHONE_NUMBER_ERROR_CODES.TOO_MANY_ATTEMPTS,
					);
				}
				if (storedOtpValue !== otpValue) {
					await ctx.context.internalAdapter.updateVerificationValue(otp.id, {
						value: `${storedOtpValue}:${parseInt(attempts || "0") + 1}`,
					});
					throw APIError.from(
						"BAD_REQUEST",
						PHONE_NUMBER_ERROR_CODES.INVALID_OTP,
					);
				}

				await ctx.context.internalAdapter.deleteVerificationValue(otp.id);
			}

			if (ctx.body.updatePhoneNumber) {
				const session = await getSessionFromCtx(ctx);
				if (!session) {
					throw APIError.from("UNAUTHORIZED", BASE_ERROR_CODES.USER_NOT_FOUND);
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
					throw APIError.from(
						"BAD_REQUEST",
						PHONE_NUMBER_ERROR_CODES.PHONE_NUMBER_EXIST,
					);
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
						throw APIError.from(
							"INTERNAL_SERVER_ERROR",
							BASE_ERROR_CODES.FAILED_TO_CREATE_USER,
						);
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
				throw APIError.from(
					"INTERNAL_SERVER_ERROR",
					BASE_ERROR_CODES.FAILED_TO_UPDATE_USER,
				);
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
					throw APIError.from(
						"INTERNAL_SERVER_ERROR",
						BASE_ERROR_CODES.FAILED_TO_CREATE_SESSION,
					);
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
			if (!opts?.sendOTP && !opts?.sendPasswordResetOTP) {
				ctx.context.logger.warn("sendOTP not implemented");
				throw APIError.from(
					"NOT_IMPLEMENTED",
					PHONE_NUMBER_ERROR_CODES.SEND_OTP_NOT_IMPLEMENTED,
				);
			}

			if (opts.phoneNumberValidator) {
				const isValidNumber = await opts.phoneNumberValidator(
					ctx.body.phoneNumber,
				);
				if (!isValidNumber) {
					throw APIError.from(
						"BAD_REQUEST",
						PHONE_NUMBER_ERROR_CODES.INVALID_PHONE_NUMBER,
					);
				}
			}

			const code = generateOTP(opts.otpLength);
			const identifier = `forget-password-otp-${ctx.body.phoneNumber}`;

			await ctx.context.internalAdapter
				.createVerificationValue({
					value: `${code}:0`,
					identifier,
					expiresAt: getDate(opts.expiresIn, "sec"),
				})
				.catch(async (error) => {
					await ctx.context.internalAdapter.deleteVerificationByIdentifier(
						identifier,
					);
					await ctx.context.internalAdapter.createVerificationValue({
						value: `${code}:0`,
						identifier,
						expiresAt: getDate(opts.expiresIn, "sec"),
					});
				});

			await ctx.context.adapter.findOne<UserWithPhoneNumber>({
				model: "user",
				where: [
					{
						value: ctx.body.phoneNumber,
						field: opts.phoneNumber,
					},
				],
			});

			if (opts.sendPasswordResetOTP) {
				await ctx.context.runInBackgroundOrAwait(
					opts.sendPasswordResetOTP(
						{
							phoneNumber: ctx.body.phoneNumber,
							code,
							type: "forget-password",
						},
						ctx,
					),
				);
			} else if (opts.sendOTP) {
				await ctx.context.runInBackgroundOrAwait(
					opts.sendOTP(
						{
							phoneNumber: ctx.body.phoneNumber,
							code,
							type: "forget-password",
						},
						ctx,
					),
				);
			}

			return ctx.json({
				status: true,
			});
		},
	);

const resetPasswordPhoneNumberBodySchema = z
	.object({
		otp: z.string().meta({
			description: 'The one time password to reset the password. Eg: "123456"',
		}),
		phoneNumber: z.string().meta({
			description:
				'The phone number to the account which intends to reset the password for. Eg: "+1234567890"',
		}),
		password: z.string().meta({
			description: `The new password. Eg: "new-and-secure-password"`,
		}).optional(),
		newPassword: z.string().meta({
			description: `The new password (deprecated: use 'password' instead). Eg: "new-and-secure-password"`,
		}).optional(),
	})
	.refine((data) => data.password || data.newPassword, {
		message: "Either 'password' or 'newPassword' must be provided",
		path: ["password"],
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
			const newPassword = ctx.body.password || ctx.body.newPassword;
			if (!newPassword) {
				throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.PASSWORD_TOO_SHORT);
			}

			const identifier = `forget-password-otp-${ctx.body.phoneNumber}`;
			const verification =
				await ctx.context.internalAdapter.findVerificationValue(identifier);
			if (!verification) {
				throw APIError.from(
					"BAD_REQUEST",
					PHONE_NUMBER_ERROR_CODES.OTP_NOT_FOUND,
				);
			}
			if (verification.expiresAt < new Date()) {
				throw APIError.from(
					"BAD_REQUEST",
					PHONE_NUMBER_ERROR_CODES.OTP_EXPIRED,
				);
			}
			const [otpValue, attempts] = verification.value.split(":");
			const allowedAttempts = opts?.allowedAttempts || 3;
			if (attempts && parseInt(attempts) >= allowedAttempts) {
				await ctx.context.internalAdapter.deleteVerificationValue(
					verification.id,
				);
				throw APIError.from(
					"FORBIDDEN",
					PHONE_NUMBER_ERROR_CODES.TOO_MANY_ATTEMPTS,
				);
			}
			if (ctx.body.otp !== otpValue) {
				await ctx.context.internalAdapter.updateVerificationValue(
					verification.id,
					{
						value: `${otpValue}:${parseInt(attempts || "0") + 1}`,
					},
				);
				throw APIError.from(
					"BAD_REQUEST",
					PHONE_NUMBER_ERROR_CODES.INVALID_OTP,
				);
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
				throw APIError.from(
					"BAD_REQUEST",
					PHONE_NUMBER_ERROR_CODES.UNEXPECTED_ERROR,
				);
			}
			const minLength = ctx.context.password.config.minPasswordLength;
			const maxLength = ctx.context.password.config.maxPasswordLength;
			if (newPassword.length < minLength) {
				throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.PASSWORD_TOO_SHORT);
			}
			if (newPassword.length > maxLength) {
				throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.PASSWORD_TOO_LONG);
			}
			const hashedPassword = await ctx.context.password.hash(newPassword);
			await ctx.context.internalAdapter.updatePassword(user.id, hashedPassword);
			await ctx.context.internalAdapter.deleteVerificationValue(
				verification.id,
			);

			if (ctx.context.options.emailAndPassword?.revokeSessionsOnPasswordReset) {
				await ctx.context.internalAdapter.deleteSessions(user.id);
			}

			return ctx.json({
				status: true,
			});
		},
	);

function generateOTP(size: number) {
	return generateRandomString(size, "0-9");
}
