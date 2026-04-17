import type { GenericEndpointContext } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import { BASE_ERROR_CODES } from "@better-auth/core/error";
import { deprecate } from "@better-auth/core/utils/deprecate";
import * as z from "zod";
import {
	APIError,
	getSessionFromCtx,
	sensitiveSessionMiddleware,
} from "../../api";
import { resolveSignIn } from "../../auth/resolve-sign-in";
import { setCookieCache, setSessionCookie } from "../../cookies";
import { generateRandomString, symmetricDecrypt } from "../../crypto";
import { parseUserInput, parseUserOutput } from "../../db/schema";
import { getDate } from "../../utils/date";
import { EMAIL_OTP_ERROR_CODES as ERROR_CODES } from "./error-codes";
import { storeOTP, tryReuseOTP, verifyStoredOTP } from "./otp-token";
import type { EmailOTPOptions, RequiredEmailOTPOptions } from "./types";
import { splitAtLastColon, toOTPIdentifier } from "./utils";

const types = [
	"email-verification",
	"sign-in",
	"forget-password",
	"change-email",
] as const;

/**
 * Resolves the OTP to send: reuses an existing one if possible,
 * otherwise generates and stores a new one.
 *
 * @internal
 */
async function resolveOTP(
	ctx: GenericEndpointContext,
	opts: RequiredEmailOTPOptions,
	email: string,
	type: (typeof types)[number],
): Promise<string> {
	const identifier = toOTPIdentifier(type, email);

	if (opts.resendStrategy === "reuse") {
		const reused = await tryReuseOTP(ctx, opts, identifier);
		if (reused) return reused;
	}

	const otp =
		opts.generateOTP({ email, type }, ctx) || defaultOTPGenerator(opts);
	const storedOTP = await storeOTP(ctx, opts, otp);

	await ctx.context.internalAdapter
		.createVerificationValue({
			value: `${storedOTP}:0`,
			identifier,
			expiresAt: getDate(opts.expiresIn, "sec"),
		})
		.catch(async () => {
			await ctx.context.internalAdapter.deleteVerificationByIdentifier(
				identifier,
			);
			await ctx.context.internalAdapter.createVerificationValue({
				value: `${storedOTP}:0`,
				identifier,
				expiresAt: getDate(opts.expiresIn, "sec"),
			});
		});

	return otp;
}

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
				throw APIError.fromStatus("BAD_REQUEST", {
					message: "send email verification is not implemented",
				});
			}
			const email = ctx.body.email.toLowerCase();
			const isValidEmail = z.email().safeParse(email);
			if (!isValidEmail.success) {
				throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.INVALID_EMAIL);
			}

			// Enforce using the correct endpoint for change email OTP
			if (ctx.body.type === "change-email") {
				ctx.context.logger.error(
					"Use the /email-otp/request-email-change endpoint to send OTP for changing email",
				);
				throw APIError.fromStatus("BAD_REQUEST", {
					message: "Invalid OTP type",
				});
			}
			const identifier = toOTPIdentifier(ctx.body.type, email);
			const otp = await resolveOTP(ctx, opts, email, ctx.body.type);

			const shouldSendOTP = ctx.body.type === "sign-in" && !opts.disableSignUp;
			const user = await ctx.context.internalAdapter.findUserByEmail(email);
			if (!user && !shouldSendOTP) {
				await ctx.context.internalAdapter.deleteVerificationByIdentifier(
					identifier,
				);
				return ctx.json({ success: true });
			}

			await ctx.context.runInBackgroundOrAwait(
				opts.sendVerificationOTP({ email, otp, type: ctx.body.type }, ctx),
			);
			return ctx.json({ success: true });
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
		{
			method: "POST",
			body: createVerificationOTPBodySchema,
			metadata: {
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
			const storedOTP = await storeOTP(ctx, opts, otp);
			await ctx.context.internalAdapter.createVerificationValue({
				value: `${storedOTP}:0`,
				identifier: toOTPIdentifier(ctx.body.type, email),
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
		{
			method: "GET",
			query: getVerificationOTPBodySchema,
			metadata: {
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
					toOTPIdentifier(ctx.query.type, email),
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
				throw APIError.fromStatus("BAD_REQUEST", {
					message: "OTP is hashed, cannot return the plain text OTP",
				});
			}

			const [storedOtp, _attempts] = splitAtLastColon(verificationValue.value);
			let otp = storedOtp;
			if (opts.storeOTP === "encrypted") {
				otp = await symmetricDecrypt({
					key: ctx.context.secretConfig,
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
				throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.INVALID_EMAIL);
			}
			const user = await ctx.context.internalAdapter.findUserByEmail(email);
			if (!user) {
				throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.USER_NOT_FOUND);
			}
			const identifier = toOTPIdentifier(ctx.body.type, email);
			const verificationValue =
				await ctx.context.internalAdapter.findVerificationValue(identifier);
			if (!verificationValue) {
				throw APIError.from("BAD_REQUEST", ERROR_CODES.INVALID_OTP);
			}
			if (verificationValue.expiresAt < new Date()) {
				await ctx.context.internalAdapter.deleteVerificationByIdentifier(
					identifier,
				);
				throw APIError.from("BAD_REQUEST", ERROR_CODES.OTP_EXPIRED);
			}

			const [otpValue, attempts] = splitAtLastColon(verificationValue.value);
			const allowedAttempts = opts?.allowedAttempts || 3;
			if (attempts && parseInt(attempts) >= allowedAttempts) {
				await ctx.context.internalAdapter.deleteVerificationByIdentifier(
					identifier,
				);
				throw APIError.from("FORBIDDEN", ERROR_CODES.TOO_MANY_ATTEMPTS);
			}
			const verified = await verifyStoredOTP(ctx, opts, otpValue, ctx.body.otp);
			if (!verified) {
				await ctx.context.internalAdapter.updateVerificationByIdentifier(
					identifier,
					{
						value: `${otpValue}:${parseInt(attempts || "0") + 1}`,
					},
				);
				throw APIError.from("BAD_REQUEST", ERROR_CODES.INVALID_OTP);
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
				throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.INVALID_EMAIL);
			}

			// Use atomic verification to prevent race conditions
			await atomicVerifyOTP(
				ctx,
				opts,
				toOTPIdentifier("email-verification", email),
				ctx.body.otp,
			);

			const user = await ctx.context.internalAdapter.findUserByEmail(email);
			if (!user) {
				/**
				 * safe to leak the existence of a user, given the user has already the OTP from the
				 * email
				 */
				throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.USER_NOT_FOUND);
			}
			if (ctx.context.options.emailVerification?.beforeEmailVerification) {
				await ctx.context.options.emailVerification.beforeEmailVerification(
					user.user,
					ctx.request,
				);
			}
			const updatedUser = await ctx.context.internalAdapter.updateUser(
				user.user.id,
				{
					email,
					emailVerified: true,
				},
			);

			await ctx.context.options.emailVerification?.afterEmailVerification?.(
				updatedUser,
				ctx.request,
			);

			if (ctx.context.options.emailVerification?.autoSignInAfterVerification) {
				const currentSession = await getSessionFromCtx(ctx);
				if (currentSession?.user.id === updatedUser.id) {
					await setSessionCookie(ctx, {
						session: currentSession.session,
						user: {
							...currentSession.user,
							emailVerified: true,
						},
					});
					return ctx.json({
						status: true,
						token: currentSession.session.token,
						user: parseUserOutput(ctx.context.options, updatedUser),
					});
				}
				const result = await resolveSignIn(ctx, {
					user: updatedUser,
				});
				if (result.kind === "challenge") {
					return ctx.json(result);
				}
				return ctx.json({
					status: true,
					token: result.session.token,
					user: parseUserOutput(ctx.context.options, result.user),
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
				user: parseUserOutput(ctx.context.options, updatedUser),
			});
		},
	);

const signInEmailOTPBodySchema = z
	.object({
		email: z.string({}).meta({
			description: "Email address to sign in",
		}),
		otp: z.string().meta({
			required: true,
			description: "OTP sent to the email",
		}),
		name: z
			.string()
			.meta({
				description:
					'User display name. Only used if the user is registering for the first time. Eg: "my-name"',
			})
			.optional(),
		image: z
			.string()
			.meta({
				description:
					"User profile image URL. Only used if the user is registering for the first time.",
			})
			.optional(),
	})
	.and(z.record(z.string(), z.any()));

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
			const { email: rawEmail, otp, name, image, ...rest } = ctx.body;
			const email = rawEmail.toLowerCase();

			// Use atomic verification to prevent race conditions
			await atomicVerifyOTP(ctx, opts, toOTPIdentifier("sign-in", email), otp);

			const user = await ctx.context.internalAdapter.findUserByEmail(email);
			if (!user) {
				if (opts.disableSignUp) {
					throw APIError.from("BAD_REQUEST", ERROR_CODES.INVALID_OTP);
				}
				const additionalFields = parseUserInput(
					ctx.context.options,
					rest,
					"create",
				);
				const newUser = await ctx.context.internalAdapter.createUser({
					...additionalFields,
					email,
					emailVerified: true,
					name: name || "",
					image,
				});
				const result = await resolveSignIn(ctx, {
					user: newUser,
				});
				if (result.kind === "challenge") {
					return ctx.json(result);
				}
				return ctx.json({
					token: result.session.token,
					user: parseUserOutput(ctx.context.options, result.user),
				});
			}

			if (!user.user.emailVerified) {
				await ctx.context.internalAdapter.updateUser(user.user.id, {
					emailVerified: true,
				});
			}

			const result = await resolveSignIn(ctx, {
				user: user.user,
			});
			if (result.kind === "challenge") {
				return ctx.json(result);
			}
			return ctx.json({
				token: result.session.token,
				user: parseUserOutput(ctx.context.options, result.user),
			});
		},
	);

const requestPasswordResetEmailOTPBodySchema = z.object({
	email: z.string().meta({
		description: "Email address to send the OTP",
	}),
});

/**
 * ### Endpoint
 *
 * POST `/email-otp/request-password-reset`
 *
 * ### API Methods
 *
 * **server:**
 * `auth.api.requestPasswordResetEmailOTP`
 *
 * **client:**
 * `authClient.emailOtp.requestPasswordReset`
 *
 * @see [Read our docs to learn more.](https://www.better-auth.com/docs/plugins/email-otp#reset-password-with-otp)
 */
export const requestPasswordResetEmailOTP = (opts: RequiredEmailOTPOptions) =>
	createAuthEndpoint(
		"/email-otp/request-password-reset",
		{
			method: "POST",
			body: requestPasswordResetEmailOTPBodySchema,
			metadata: {
				openapi: {
					operationId: "requestPasswordResetWithEmailOTP",
					description: "Request password reset with email and OTP",
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
			const identifier = toOTPIdentifier("forget-password", email);
			const otp = await resolveOTP(ctx, opts, email, "forget-password");
			const user = await ctx.context.internalAdapter.findUserByEmail(email);
			if (!user) {
				await ctx.context.internalAdapter.deleteVerificationByIdentifier(
					identifier,
				);
				return ctx.json({
					success: true,
				});
			}
			await ctx.context.runInBackgroundOrAwait(
				opts.sendVerificationOTP(
					{
						email,
						otp,
						type: "forget-password",
					},
					ctx,
				),
			);
			return ctx.json({
				success: true,
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
 * @deprecated Use `/email-otp/request-password-reset` instead.
 * @see [Read our docs to learn more.](https://www.better-auth.com/docs/plugins/email-otp#reset-password-with-otp)
 */
export const forgetPasswordEmailOTP = (opts: RequiredEmailOTPOptions) => {
	const warnDeprecation = deprecate(
		() => {},
		'The "/forget-password/email-otp" endpoint is deprecated. ' +
			'Please use "/email-otp/request-password-reset" instead. ' +
			"This endpoint will be removed in the next major version.",
	);

	return createAuthEndpoint(
		"/forget-password/email-otp",
		{
			method: "POST",
			body: forgetPasswordEmailOTPBodySchema,
			metadata: {
				openapi: {
					operationId: "forgetPasswordWithEmailOTP",
					description:
						"Deprecated: Use /email-otp/request-password-reset instead.",
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
			warnDeprecation();
			const email = ctx.body.email;
			const identifier = toOTPIdentifier("forget-password", email);
			const otp = await resolveOTP(ctx, opts, email, "forget-password");
			const user = await ctx.context.internalAdapter.findUserByEmail(email);
			if (!user) {
				await ctx.context.internalAdapter.deleteVerificationByIdentifier(
					identifier,
				);
				return ctx.json({
					success: true,
				});
			}
			await ctx.context.runInBackgroundOrAwait(
				opts.sendVerificationOTP(
					{
						email,
						otp,
						type: "forget-password",
					},
					ctx,
				),
			);
			return ctx.json({
				success: true,
			});
		},
	);
};

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

			// Use atomic verification to prevent race conditions
			await atomicVerifyOTP(
				ctx,
				opts,
				toOTPIdentifier("forget-password", email),
				ctx.body.otp,
			);

			const user = await ctx.context.internalAdapter.findUserByEmail(email, {
				includeAccounts: true,
			});
			if (!user) {
				throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.USER_NOT_FOUND);
			}
			const minPasswordLength = ctx.context.password.config.minPasswordLength;
			if (ctx.body.password.length < minPasswordLength) {
				throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.PASSWORD_TOO_SHORT);
			}
			const maxPasswordLength = ctx.context.password.config.maxPasswordLength;
			if (ctx.body.password.length > maxPasswordLength) {
				throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.PASSWORD_TOO_LONG);
			}
			const passwordHash = await ctx.context.password.hash(ctx.body.password);
			const account = user.accounts?.find(
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

const requestEmailChangeEmailOTPBodySchema = z.object({
	newEmail: z.string().meta({
		description: "New email address to send the OTP",
	}),
	otp: z.string().optional().meta({
		description:
			"OTP sent to the current email. This is required if changeEmail.verifyCurrentEmail option is set to true",
	}),
});

/**
 * ### Endpoint
 *
 * POST `/email-otp/request-email-change`
 *
 * ### API Methods
 *
 * **server:**
 * `auth.api.requestEmailChangeEmailOTP`
 *
 * **client:**
 * `authClient.emailOtp.requestEmailChange`
 *
 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/email-otp#change-email-with-otp)
 */
export const requestEmailChangeEmailOTP = (opts: RequiredEmailOTPOptions) =>
	createAuthEndpoint(
		"/email-otp/request-email-change",
		{
			method: "POST",
			body: requestEmailChangeEmailOTPBodySchema,
			use: [sensitiveSessionMiddleware],
			metadata: {
				openapi: {
					operationId: "requestEmailChangeWithEmailOTP",
					description:
						"Request email change with verification OTP sent to the new email",
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
			if (!opts.changeEmail?.enabled) {
				ctx.context.logger.error("Change email with OTP is disabled.");
				throw APIError.fromStatus("BAD_REQUEST", {
					message: "Change email with OTP is disabled",
				});
			}

			const email = ctx.context.session.user.email.toLowerCase();
			const newEmail = ctx.body.newEmail.toLowerCase();
			const isValidEmail = z.email().safeParse(newEmail);
			if (!isValidEmail.success) {
				throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.INVALID_EMAIL);
			}
			if (newEmail === email) {
				ctx.context.logger.error("Email is the same");
				throw APIError.fromStatus("BAD_REQUEST", {
					message: "Email is the same",
				});
			}

			if (opts.changeEmail?.verifyCurrentEmail) {
				if (!ctx.body.otp) {
					throw APIError.fromStatus("BAD_REQUEST", {
						message: "OTP is required to verify current email",
					});
				}

				const currentEmailVerificationValue =
					await ctx.context.internalAdapter.findVerificationValue(
						toOTPIdentifier("email-verification", email),
					);
				if (!currentEmailVerificationValue) {
					throw APIError.from("BAD_REQUEST", ERROR_CODES.INVALID_OTP);
				}
				const currentEmailIdentifier = toOTPIdentifier(
					"email-verification",
					email,
				);
				if (currentEmailVerificationValue.expiresAt < new Date()) {
					await ctx.context.internalAdapter.deleteVerificationByIdentifier(
						currentEmailIdentifier,
					);
					throw APIError.from("BAD_REQUEST", ERROR_CODES.OTP_EXPIRED);
				}

				const [otpValue, attempts] = splitAtLastColon(
					currentEmailVerificationValue.value,
				);
				const allowedAttempts = opts?.allowedAttempts || 3;
				if (attempts && parseInt(attempts) >= allowedAttempts) {
					await ctx.context.internalAdapter.deleteVerificationByIdentifier(
						currentEmailIdentifier,
					);
					throw APIError.from("FORBIDDEN", ERROR_CODES.TOO_MANY_ATTEMPTS);
				}

				const verified = await verifyStoredOTP(
					ctx,
					opts,
					otpValue,
					ctx.body.otp,
				);
				if (!verified) {
					await ctx.context.internalAdapter.updateVerificationByIdentifier(
						currentEmailIdentifier,
						{
							value: `${otpValue}:${parseInt(attempts || "0") + 1}`,
						},
					);
					throw APIError.from("BAD_REQUEST", ERROR_CODES.INVALID_OTP);
				}
				await ctx.context.internalAdapter.deleteVerificationByIdentifier(
					currentEmailIdentifier,
				);
			} else {
				if (ctx.body.otp) {
					ctx.context.logger.warn(
						"OTP provided but not required for verifying current email. " +
							"If you want to require OTP verification for current email, " +
							"please set the changeEmail.verifyCurrentEmail option to true in the configuration",
					);
				}
			}

			const otp =
				opts.generateOTP({ email: newEmail, type: "change-email" }, ctx) ||
				defaultOTPGenerator(opts);
			const storedOTP = await storeOTP(ctx, opts, otp);
			await ctx.context.internalAdapter.createVerificationValue({
				value: `${storedOTP}:0`,
				identifier: toOTPIdentifier("change-email", `${email}-${newEmail}`),
				expiresAt: getDate(opts.expiresIn, "sec"),
			});

			const user = await ctx.context.internalAdapter.findUserByEmail(newEmail);
			if (user) {
				await ctx.context.internalAdapter.deleteVerificationByIdentifier(
					toOTPIdentifier("change-email", `${email}-${newEmail}`),
				);
				return ctx.json({
					success: true,
				});
			}

			await ctx.context.runInBackgroundOrAwait(
				opts.sendVerificationOTP(
					{
						email: newEmail,
						otp,
						type: "change-email",
					},
					ctx,
				),
			);
			return ctx.json({
				success: true,
			});
		},
	);

const changeEmailEmailOTPBodySchema = z.object({
	newEmail: z.string().meta({
		description: "New email address to verify and change to",
	}),
	otp: z.string().meta({
		description: "OTP sent to the new email",
	}),
});

/**
 * ### Endpoint
 *
 * POST `/email-otp/change-email`
 *
 * ### API Methods
 *
 * **server:**
 * `auth.api.changeEmailEmailOTP`
 *
 * **client:**
 * `authClient.emailOtp.changeEmail`
 *
 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/email-otp#change-email-with-otp)
 */
export const changeEmailEmailOTP = (opts: RequiredEmailOTPOptions) =>
	createAuthEndpoint(
		"/email-otp/change-email",
		{
			method: "POST",
			body: changeEmailEmailOTPBodySchema,
			use: [sensitiveSessionMiddleware],
			metadata: {
				openapi: {
					operationId: "changeEmailWithEmailOTP",
					description:
						"Verify new email with OTP and change the email if verification is successful",
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
			if (!opts.changeEmail?.enabled) {
				ctx.context.logger.error("Change email with OTP is disabled.");
				throw APIError.fromStatus("BAD_REQUEST", {
					message: "Change email with OTP is disabled",
				});
			}

			const session = ctx.context.session;

			const email = session.user.email.toLowerCase();
			const newEmail = ctx.body.newEmail.toLowerCase();
			const isValidNewEmail = z.email().safeParse(newEmail);
			if (!isValidNewEmail.success) {
				throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.INVALID_EMAIL);
			}
			if (newEmail === email) {
				ctx.context.logger.error("Email is the same");
				throw APIError.fromStatus("BAD_REQUEST", {
					message: "Email is the same",
				});
			}

			const verificationValue =
				await ctx.context.internalAdapter.findVerificationValue(
					toOTPIdentifier("change-email", `${email}-${newEmail}`),
				);
			if (!verificationValue) {
				throw APIError.from("BAD_REQUEST", ERROR_CODES.INVALID_OTP);
			}
			const changeEmailIdentifier = toOTPIdentifier(
				"change-email",
				`${email}-${newEmail}`,
			);
			if (verificationValue.expiresAt < new Date()) {
				await ctx.context.internalAdapter.deleteVerificationByIdentifier(
					changeEmailIdentifier,
				);
				throw APIError.from("BAD_REQUEST", ERROR_CODES.OTP_EXPIRED);
			}

			const [otpValue, attempts] = splitAtLastColon(verificationValue.value);
			const allowedAttempts = opts?.allowedAttempts || 3;
			if (attempts && parseInt(attempts) >= allowedAttempts) {
				await ctx.context.internalAdapter.deleteVerificationByIdentifier(
					changeEmailIdentifier,
				);
				throw APIError.from("FORBIDDEN", ERROR_CODES.TOO_MANY_ATTEMPTS);
			}

			const verified = await verifyStoredOTP(ctx, opts, otpValue, ctx.body.otp);
			if (!verified) {
				await ctx.context.internalAdapter.updateVerificationByIdentifier(
					changeEmailIdentifier,
					{
						value: `${otpValue}:${parseInt(attempts || "0") + 1}`,
					},
				);
				throw APIError.from("BAD_REQUEST", ERROR_CODES.INVALID_OTP);
			}
			await ctx.context.internalAdapter.deleteVerificationByIdentifier(
				changeEmailIdentifier,
			);

			const currentUser =
				await ctx.context.internalAdapter.findUserByEmail(email);
			if (!currentUser) {
				/**
				 * safe to leak the existence of a user as a valid OTP has been provided
				 */
				throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.USER_NOT_FOUND);
			}

			const existingUserWithNewEmail =
				await ctx.context.internalAdapter.findUserByEmail(newEmail);
			if (existingUserWithNewEmail) {
				/**
				 * safe to leak the existence of a user as a valid OTP has been provided
				 */
				throw APIError.fromStatus("BAD_REQUEST", {
					message: "Email already in use",
				});
			}

			if (ctx.context.options.emailVerification?.beforeEmailVerification) {
				await ctx.context.options.emailVerification.beforeEmailVerification(
					currentUser.user,
					ctx.request,
				);
			}
			const updatedUser = await ctx.context.internalAdapter.updateUser(
				currentUser.user.id,
				{
					email: newEmail,
					emailVerified: true,
				},
			);
			if (ctx.context.options.emailVerification?.afterEmailVerification) {
				await ctx.context.options.emailVerification.afterEmailVerification(
					updatedUser,
					ctx.request,
				);
			}
			await setSessionCookie(ctx, {
				session: session.session,
				user: {
					...session.user,
					email: newEmail,
					emailVerified: true,
				},
			});

			return ctx.json({
				success: true,
			});
		},
	);

const defaultOTPGenerator = (options: EmailOTPOptions) =>
	generateRandomString(options.otpLength ?? 6, "0-9");

/**
 * Atomically verifies OTP with race condition protection.
 * Deletes token before verification to prevent concurrent reuse.
 * Re-creates token with incremented attempts on failure.
 */
async function atomicVerifyOTP(
	ctx: GenericEndpointContext,
	opts: RequiredEmailOTPOptions,
	identifier: string,
	providedOTP: string,
): Promise<void> {
	const verificationValue =
		await ctx.context.internalAdapter.findVerificationValue(identifier);

	if (!verificationValue) {
		throw APIError.from("BAD_REQUEST", ERROR_CODES.INVALID_OTP);
	}

	if (verificationValue.expiresAt < new Date()) {
		await ctx.context.internalAdapter.deleteVerificationByIdentifier(
			identifier,
		);
		throw APIError.from("BAD_REQUEST", ERROR_CODES.OTP_EXPIRED);
	}

	const [otpValue, attempts] = splitAtLastColon(verificationValue.value);
	const allowedAttempts = opts?.allowedAttempts || 3;

	if (attempts && parseInt(attempts) >= allowedAttempts) {
		await ctx.context.internalAdapter.deleteVerificationByIdentifier(
			identifier,
		);
		throw APIError.from("FORBIDDEN", ERROR_CODES.TOO_MANY_ATTEMPTS);
	}

	// Atomically delete token before verification to prevent race condition
	await ctx.context.internalAdapter.deleteVerificationByIdentifier(identifier);

	const verified = await verifyStoredOTP(ctx, opts, otpValue, providedOTP);

	if (!verified) {
		// Re-create with incremented attempts
		await ctx.context.internalAdapter.createVerificationValue({
			value: `${otpValue}:${parseInt(attempts || "0") + 1}`,
			identifier,
			expiresAt: verificationValue.expiresAt,
		});
		throw APIError.from("BAD_REQUEST", ERROR_CODES.INVALID_OTP);
	}
}
