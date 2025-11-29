import type {
	BetterAuthPlugin,
	GenericEndpointContext,
} from "@better-auth/core";
import {
	createAuthEndpoint,
	createAuthMiddleware,
} from "@better-auth/core/api";
import type { User } from "@better-auth/core/db";
import { BASE_ERROR_CODES } from "@better-auth/core/error";
import { defineErrorCodes } from "@better-auth/core/utils";
import * as z from "zod";
import { APIError, getSessionFromCtx } from "../../api";
import { setCookieCache, setSessionCookie } from "../../cookies";
import {
	constantTimeEqual,
	generateRandomString,
	symmetricDecrypt,
	symmetricEncrypt,
} from "../../crypto";
import { getDate } from "../../utils/date";
import { getEndpointResponse } from "../../utils/plugin-helper";
import type { UsernameOptions } from "../username";
import { USERNAME_ERROR_CODES } from "../username";
import { defaultKeyHasher, splitAtLastColon } from "./utils";

export interface EmailOTPOptions {
	/**
	 * Function to send email verification.
	 *
	 * It is recommended to not await the email sending to avoid timing attacks.
	 * On serverless platforms, use `waitUntil` or similar to ensure the email is sent.
	 */
	sendVerificationOTP: (
		data: {
			email: string;
			otp: string;
			type: "sign-in" | "email-verification" | "forget-password";
		},
		ctx?: GenericEndpointContext | undefined,
	) => Promise<void>;
	/**
	 * Length of the OTP
	 *
	 * @default 6
	 */
	otpLength?: number | undefined;
	/**
	 * Expiry time of the OTP in seconds
	 *
	 * @default 300 (5 minutes)
	 */
	expiresIn?: number | undefined;
	/**
	 * Custom function to generate otp
	 */
	generateOTP?: (
		data: {
			email: string;
			type: "sign-in" | "email-verification" | "forget-password";
		},
		ctx?: GenericEndpointContext,
	) => string | undefined;
	/**
	 * Send email verification on sign-up
	 *
	 * @Default false
	 */
	sendVerificationOnSignUp?: boolean | undefined;
	/**
	 * A boolean value that determines whether to prevent
	 * automatic sign-up when the user is not registered.
	 *
	 * @Default false
	 */
	disableSignUp?: boolean | undefined;
	/**
	 * Allowed attempts for the OTP code
	 * @default 3
	 */
	allowedAttempts?: number | undefined;
	/**
	 * Store the OTP in your database in a secure way
	 * Note: This will not affect the OTP sent to the user, it will only affect the OTP stored in your database
	 *
	 * @default "plain"
	 */
	storeOTP?:
		| (
				| "hashed"
				| "plain"
				| "encrypted"
				| { hash: (otp: string) => Promise<string> }
				| {
						encrypt: (otp: string) => Promise<string>;
						decrypt: (otp: string) => Promise<string>;
				  }
		  )
		| undefined;
	/**
	 * Override the default email verification to use email otp instead
	 *
	 * @default false
	 */
	overrideDefaultEmailVerification?: boolean | undefined;
}

const types = ["email-verification", "sign-in", "forget-password"] as const;

const defaultOTPGenerator = (options: EmailOTPOptions) =>
	generateRandomString(options.otpLength ?? 6, "0-9");

const ERROR_CODES = defineErrorCodes({
	OTP_EXPIRED: "OTP expired",
	INVALID_OTP: "Invalid OTP",
	TOO_MANY_ATTEMPTS: "Too many attempts",
});

export const emailOTP = (options: EmailOTPOptions) => {
	const opts = {
		expiresIn: 5 * 60,
		generateOTP: () => defaultOTPGenerator(options),
		storeOTP: "plain",
		...options,
	} satisfies EmailOTPOptions;

	function normalizer(username: string, options: UsernameOptions) {
		if (options?.usernameNormalization === false) {
			return username;
		}
		if (options?.usernameNormalization) {
			return options.usernameNormalization(username);
		}
		return username.toLowerCase();
	}

	function defaultUsernameValidator(username: string) {
		return /^[a-zA-Z0-9_.]+$/.test(username);
	}

	async function storeOTP(ctx: GenericEndpointContext, otp: string) {
		if (opts.storeOTP === "encrypted") {
			return await symmetricEncrypt({
				key: ctx.context.secret,
				data: otp,
			});
		}
		if (opts.storeOTP === "hashed") {
			return await defaultKeyHasher(otp);
		}
		if (typeof opts.storeOTP === "object" && "hash" in opts.storeOTP) {
			return await opts.storeOTP.hash(otp);
		}
		if (typeof opts.storeOTP === "object" && "encrypt" in opts.storeOTP) {
			return await opts.storeOTP.encrypt(otp);
		}

		return otp;
	}

	async function verifyStoredOTP(
		ctx: GenericEndpointContext,
		storedOtp: string,
		otp: string,
	): Promise<boolean> {
		if (opts.storeOTP === "encrypted") {
			const decryptedOtp = await symmetricDecrypt({
				key: ctx.context.secret,
				data: storedOtp,
			});
			return constantTimeEqual(decryptedOtp, otp);
		}
		if (opts.storeOTP === "hashed") {
			const hashedOtp = await defaultKeyHasher(otp);
			return constantTimeEqual(hashedOtp, storedOtp);
		}
		if (typeof opts.storeOTP === "object" && "hash" in opts.storeOTP) {
			const hashedOtp = await opts.storeOTP.hash(otp);
			return constantTimeEqual(hashedOtp, storedOtp);
		}
		if (typeof opts.storeOTP === "object" && "decrypt" in opts.storeOTP) {
			const decryptedOtp = await opts.storeOTP.decrypt(storedOtp);
			return constantTimeEqual(decryptedOtp, otp);
		}

		return constantTimeEqual(otp, storedOtp);
	}
	const endpoints = {
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
		sendVerificationOTP: createAuthEndpoint(
			"/email-otp/send-verification-otp",
			{
				method: "POST",
				body: z.object({
					email: z.string({}).meta({
						description: "Email address to send the OTP",
					}),
					type: z.enum(types).meta({
						description: "Type of the OTP",
					}),
				}),
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
				if (!options?.sendVerificationOTP) {
					ctx.context.logger.error(
						"send email verification is not implemented",
					);
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

				let storedOTP = await storeOTP(ctx, otp);

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

				await options.sendVerificationOTP(
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
		),
	};

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
							await endpoints.sendVerificationOTP({
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
			...endpoints,
			createVerificationOTP: createAuthEndpoint(
				"/email-otp/create-verification-otp",
				{
					method: "POST",
					body: z.object({
						email: z.string({}).meta({
							description: "Email address to send the OTP",
						}),
						type: z.enum(types).meta({
							required: true,
							description: "Type of the OTP",
						}),
					}),
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
					let storedOTP = await storeOTP(ctx, otp);
					await ctx.context.internalAdapter.createVerificationValue({
						value: `${storedOTP}:0`,
						identifier: `${ctx.body.type}-otp-${email}`,
						expiresAt: getDate(opts.expiresIn, "sec"),
					});
					return otp;
				},
			),
			/**
			 * ### Endpoint
			 *
			 * POST `/email-otp/send-username-sign-in-otp`
			 *
			 * ### API Methods
			 *
			 * **server:**
			 * `auth.api.sendUsernameSignInOtp`
			 *
			 * **client:**
			 * `authClient.emailOtp.sendUsernameSignInOtp`
			 *
			 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/email-otp#api-method-email-otp-send-username-sign-in-otp)
			 */
			sendUsernameSignInOtp: createAuthEndpoint(
				"/email-otp/send-username-sign-in-otp",
				{
					method: "POST",
					body: z.object({
						username: z.string().meta({
							description: "Username of the account to send the OTP to",
						}),
					}),
					metadata: {
						openapi: {
							operationId: "sendUsernameSignInOtp",
							description:
								"Send a sign-in OTP to the email of the account with the given username",
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
					const usernameOptions = ctx.context.options.plugins?.find(
						(plugin) => plugin.id === "username",
					) as UsernameOptions | undefined;

					if (!usernameOptions) {
						ctx.context.logger.error("username plugin not enabled");
						throw new APIError("BAD_REQUEST", {
							message: "username plugin not enabled",
						});
					}

					const username =
						usernameOptions?.validationOrder?.username === "pre-normalization"
							? normalizer(ctx.body.username, usernameOptions)
							: ctx.body.username;

					const minUsernameLength = usernameOptions?.minUsernameLength || 3;
					const maxUsernameLength = usernameOptions?.maxUsernameLength || 30;

					if (username.length < minUsernameLength) {
						ctx.context.logger.error("Username too short", {
							username,
						});
						throw new APIError("UNPROCESSABLE_ENTITY", {
							code: "USERNAME_TOO_SHORT",
							message: USERNAME_ERROR_CODES.USERNAME_TOO_SHORT,
						});
					}

					if (username.length > maxUsernameLength) {
						ctx.context.logger.error("Username too long", {
							username,
						});
						throw new APIError("UNPROCESSABLE_ENTITY", {
							message: USERNAME_ERROR_CODES.USERNAME_TOO_LONG,
						});
					}

					const validator =
						usernameOptions?.usernameValidator || defaultUsernameValidator;

					if (!validator(username)) {
						throw new APIError("UNPROCESSABLE_ENTITY", {
							message: USERNAME_ERROR_CODES.INVALID_USERNAME,
						});
					}

					const normalizedUsername = normalizer(username, usernameOptions);

					const user = await ctx.context.adapter.findOne<
						User & { username: string; displayUsername: string }
					>({
						model: "user",
						where: [
							{
								field: "username",
								value: normalizedUsername,
							},
						],
					});
					if (!user) {
						return ctx.json({ success: true });
					}

					let otp =
						opts.generateOTP({ email: user.email, type: "sign-in" }, ctx) ||
						defaultOTPGenerator(opts);

					let storedOTP = await storeOTP(ctx, otp);

					// use different namespace identifier to avoid collision with email-based sign-in
					await ctx.context.internalAdapter
						.createVerificationValue({
							value: `${storedOTP}:0`,
							identifier: `sign-in-otp-username-${normalizedUsername}`,
							expiresAt: getDate(opts.expiresIn, "sec"),
						})
						.catch(async (error) => {
							// might be duplicate key error
							await ctx.context.internalAdapter.deleteVerificationByIdentifier(
								`sign-in-otp-username-${normalizedUsername}`,
							);
							//try again
							await ctx.context.internalAdapter.createVerificationValue({
								value: `${storedOTP}:0`,
								identifier: `sign-in-otp-username-${normalizedUsername}`,
								expiresAt: getDate(opts.expiresIn, "sec"),
							});
						});

					await options.sendVerificationOTP(
						{
							email: user.email,
							otp,
							type: "sign-in",
						},
						ctx,
					);

					return ctx.json({ success: true });
				},
			),
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
			getVerificationOTP: createAuthEndpoint(
				"/email-otp/get-verification-otp",
				{
					method: "GET",
					query: z.object({
						email: z.string({}).meta({
							description: "Email address the OTP was sent to",
						}),
						type: z.enum(types).meta({
							required: true,
							description: "Type of the OTP",
						}),
					}),
					metadata: {
						SERVER_ONLY: true,
						openapi: {
							operationId: "getEmailVerificationOTP",
							description: "Get a verification OTP for an email",
							responses: {
								"200": {
									description:
										"OTP retrieved successfully or not found/expired",
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

					let [storedOtp, _attempts] = splitAtLastColon(
						verificationValue.value,
					);
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
			),
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
			checkVerificationOTP: createAuthEndpoint(
				"/email-otp/check-verification-otp",
				{
					method: "POST",
					body: z.object({
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
					}),
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

					const [otpValue, attempts] = splitAtLastColon(
						verificationValue.value,
					);
					const allowedAttempts = options?.allowedAttempts || 3;
					if (attempts && parseInt(attempts) >= allowedAttempts) {
						await ctx.context.internalAdapter.deleteVerificationValue(
							verificationValue.id,
						);
						throw new APIError("FORBIDDEN", {
							message: ERROR_CODES.TOO_MANY_ATTEMPTS,
						});
					}
					const verified = await verifyStoredOTP(ctx, otpValue, ctx.body.otp);
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
			),
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
			verifyEmailOTP: createAuthEndpoint(
				"/email-otp/verify-email",
				{
					method: "POST",
					body: z.object({
						email: z.string({}).meta({
							description: "Email address to verify",
						}),
						otp: z.string().meta({
							required: true,
							description: "OTP to verify",
						}),
					}),
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

					const [otpValue, attempts] = splitAtLastColon(
						verificationValue.value,
					);
					const allowedAttempts = options?.allowedAttempts || 3;
					if (attempts && parseInt(attempts) >= allowedAttempts) {
						await ctx.context.internalAdapter.deleteVerificationValue(
							verificationValue.id,
						);
						throw new APIError("FORBIDDEN", {
							message: ERROR_CODES.TOO_MANY_ATTEMPTS,
						});
					}
					const verified = await verifyStoredOTP(ctx, otpValue, ctx.body.otp);
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

					if (
						ctx.context.options.emailVerification?.autoSignInAfterVerification
					) {
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
			),
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
			signInEmailOTP: createAuthEndpoint(
				"/sign-in/email-otp",
				{
					method: "POST",
					body: z.object({
						email: z.string({}).meta({
							description: "Email address to sign in",
						}),
						otp: z.string().meta({
							required: true,
							description: "OTP sent to the email",
						}),
					}),
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
					const [otpValue, attempts] = splitAtLastColon(
						verificationValue.value,
					);
					const allowedAttempts = options?.allowedAttempts || 3;
					if (attempts && parseInt(attempts) >= allowedAttempts) {
						await ctx.context.internalAdapter.deleteVerificationValue(
							verificationValue.id,
						);
						throw new APIError("FORBIDDEN", {
							message: ERROR_CODES.TOO_MANY_ATTEMPTS,
						});
					}
					const verified = await verifyStoredOTP(ctx, otpValue, ctx.body.otp);
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
			),
			/**
			 * ### Endpoint
			 *
			 * POST `/sign-in/username-otp`
			 *
			 * ### API Methods
			 *
			 * **server:**
			 * `auth.api.signInUsernameOtp`
			 *
			 * **client:**
			 * `authClient.signIn.usernameOtp`
			 *
			 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/email-otp#api-method-sign-in-username-otp)
			 */
			signInUsernameOtp: createAuthEndpoint(
				"/sign-in/username-otp",
				{
					method: "POST",
					body: z.object({
						username: z.string({}).meta({
							description: "Username of the account to sign in",
						}),
						otp: z.string().meta({
							required: true,
							description:
								"OTP sent to the email associated with the given username",
						}),
					}),
					metadata: {
						openapi: {
							operationId: "signInUsernameOtp",
							description: "Sign in with username and OTP",
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
					const usernameOptions = ctx.context.options.plugins?.find(
						(plugin) => plugin.id === "username",
					) as UsernameOptions | undefined;

					if (!usernameOptions) {
						ctx.context.logger.error("username plugin not enabled");
						throw new APIError("BAD_REQUEST", {
							message: "username plugin not enabled",
						});
					}

					const username =
						usernameOptions?.validationOrder?.username === "pre-normalization"
							? normalizer(ctx.body.username, usernameOptions)
							: ctx.body.username;

					const minUsernameLength = usernameOptions?.minUsernameLength || 3;
					const maxUsernameLength = usernameOptions?.maxUsernameLength || 30;

					if (username.length < minUsernameLength) {
						ctx.context.logger.error("Username too short", {
							username,
						});
						throw new APIError("UNPROCESSABLE_ENTITY", {
							code: "USERNAME_TOO_SHORT",
							message: USERNAME_ERROR_CODES.USERNAME_TOO_SHORT,
						});
					}

					if (username.length > maxUsernameLength) {
						ctx.context.logger.error("Username too long", {
							username,
						});
						throw new APIError("UNPROCESSABLE_ENTITY", {
							message: USERNAME_ERROR_CODES.USERNAME_TOO_LONG,
						});
					}

					const validator =
						usernameOptions?.usernameValidator || defaultUsernameValidator;

					if (!validator(username)) {
						throw new APIError("UNPROCESSABLE_ENTITY", {
							message: USERNAME_ERROR_CODES.INVALID_USERNAME,
						});
					}

					const normalizedUsername = normalizer(username, usernameOptions);

					const verificationValue =
						await ctx.context.internalAdapter.findVerificationValue(
							`sign-in-otp-username-${normalizedUsername}`,
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

					const [otpValue, attempts] = splitAtLastColon(
						verificationValue.value,
					);

					const allowedAttempts = options?.allowedAttempts || 3;

					if (attempts && parseInt(attempts) >= allowedAttempts) {
						await ctx.context.internalAdapter.deleteVerificationValue(
							verificationValue.id,
						);

						throw new APIError("FORBIDDEN", {
							message: ERROR_CODES.TOO_MANY_ATTEMPTS,
						});
					}

					const verified = await verifyStoredOTP(ctx, otpValue, ctx.body.otp);
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

					const user = await ctx.context.adapter.findOne<
						User & { username: string; displayUsername: string }
					>({
						model: "user",
						where: [
							{
								field: "username",
								value: normalizedUsername,
							},
						],
					});
					if (!user) {
						throw new APIError("UNAUTHORIZED", {
							message: USERNAME_ERROR_CODES.INVALID_USERNAME,
						});
					}

					if (!user.emailVerified) {
						await ctx.context.internalAdapter.updateUser(user.id, {
							emailVerified: true,
						});
					}

					const session = await ctx.context.internalAdapter.createSession(
						user.id,
					);
					await setSessionCookie(ctx, { session, user });

					return ctx.json({
						token: session.token,
						user: {
							id: user.id,
							email: user.email,
							emailVerified: user.emailVerified,
							name: user.name,
							image: user.image,
							createdAt: user.createdAt,
							updatedAt: user.updatedAt,
						},
					});
				},
			),
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
			forgetPasswordEmailOTP: createAuthEndpoint(
				"/forget-password/email-otp",
				{
					method: "POST",
					body: z.object({
						email: z.string().meta({
							description: "Email address to send the OTP",
						}),
					}),
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
					let storedOTP = await storeOTP(ctx, otp);
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
					await options
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
			),
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
			resetPasswordEmailOTP: createAuthEndpoint(
				"/email-otp/reset-password",
				{
					method: "POST",
					body: z.object({
						email: z.string().meta({
							description: "Email address to reset the password",
						}),
						otp: z.string().meta({
							description: "OTP sent to the email",
						}),
						password: z.string().meta({
							description: "New password",
						}),
					}),
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
					const [otpValue, attempts] = splitAtLastColon(
						verificationValue.value,
					);
					const allowedAttempts = options?.allowedAttempts || 3;
					if (attempts && parseInt(attempts) >= allowedAttempts) {
						await ctx.context.internalAdapter.deleteVerificationValue(
							verificationValue.id,
						);
						throw new APIError("FORBIDDEN", {
							message: ERROR_CODES.TOO_MANY_ATTEMPTS,
						});
					}
					const verified = await verifyStoredOTP(ctx, otpValue, ctx.body.otp);
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
					const user = await ctx.context.internalAdapter.findUserByEmail(
						email,
						{
							includeAccounts: true,
						},
					);
					if (!user) {
						throw new APIError("BAD_REQUEST", {
							message: BASE_ERROR_CODES.USER_NOT_FOUND,
						});
					}
					const minPasswordLength =
						ctx.context.password.config.minPasswordLength;
					if (ctx.body.password.length < minPasswordLength) {
						throw new APIError("BAD_REQUEST", {
							message: BASE_ERROR_CODES.PASSWORD_TOO_SHORT,
						});
					}
					const maxPasswordLength =
						ctx.context.password.config.maxPasswordLength;
					if (ctx.body.password.length > maxPasswordLength) {
						throw new APIError("BAD_REQUEST", {
							message: BASE_ERROR_CODES.PASSWORD_TOO_LONG,
						});
					}
					const passwordHash = await ctx.context.password.hash(
						ctx.body.password,
					);
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

					if (
						ctx.context.options.emailAndPassword?.revokeSessionsOnPasswordReset
					) {
						await ctx.context.internalAdapter.deleteSessions(user.user.id);
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
							let storedOTP = await storeOTP(ctx, otp);
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
			{
				pathMatcher(path) {
					return path === "/email-otp/send-username-sign-in-otp";
				},
				window: 60,
				max: 3,
			},
			{
				pathMatcher(path) {
					return path === "/sign-in/username-otp";
				},
				window: 60,
				max: 3,
			},
		],
	} satisfies BetterAuthPlugin;
};
