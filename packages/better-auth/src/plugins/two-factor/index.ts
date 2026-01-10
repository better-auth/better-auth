import type { BetterAuthPlugin } from "@better-auth/core";
import {
	createAuthEndpoint,
	createAuthMiddleware,
} from "@better-auth/core/api";
import { APIError, BASE_ERROR_CODES } from "@better-auth/core/error";
import { createHMAC } from "@better-auth/utils/hmac";
import { createOTP } from "@better-auth/utils/otp";
import * as z from "zod";
import { sessionMiddleware } from "../../api";
import {
	deleteSessionCookie,
	setCookieCache,
	setSessionCookie,
} from "../../cookies";
import { symmetricEncrypt } from "../../crypto";
import { generateRandomString } from "../../crypto/random";
import { mergeSchema } from "../../db/schema";
import { validatePassword } from "../../utils/password";
import type { BackupCodeOptions } from "./backup-codes";
import { backupCode2fa, generateBackupCodes } from "./backup-codes";
import {
	TRUST_DEVICE_COOKIE_MAX_AGE,
	TRUST_DEVICE_COOKIE_NAME,
	TWO_FACTOR_COOKIE_NAME,
} from "./constant";
import { TWO_FACTOR_ERROR_CODES } from "./error-code";
import { otp2fa } from "./otp";
import { schema } from "./schema";
import { totp2fa } from "./totp";
import type { TwoFactorOptions, UserWithTwoFactor } from "./types";
import { verifyTwoFactor } from "./verify-two-factor";

export * from "./error-code";

declare module "@better-auth/core" {
	// biome-ignore lint/correctness/noUnusedVariables: Auth and Context need to be same as declared in the module
	interface BetterAuthPluginRegistry<Auth, Context> {
		"two-factor": {
			creator: typeof twoFactor;
		};
	}
}

const enableTwoFactorBodySchema = z.object({
	password: z.string().meta({
		description: "User password",
	}),
	issuer: z
		.string()
		.meta({
			description: "Custom issuer for the TOTP URI",
		})
		.optional(),
});

const disableTwoFactorBodySchema = z.object({
	password: z.string().meta({
		description: "User password",
	}),
});

/**
 * Two-factor authentication plugin
 *
 * @example Basic phone number OTP configuration
 * ```ts
 * twoFactor({
 *   userMetadata: (user) => ({
 *     hasPhoneNumber: user.phoneNumber && user.phoneNumberVerified,
 *     preferredName: user.name || user.email?.split('@')[0]
 *   }),
 *   otpOptions: {
 *     sendOTP: (data, ctx) => {
 *       const deliveryMethod = ctx?.query?.otpDeliveryMethod;
 *
 *       if (deliveryMethod === "sms") {
 *         // Send SMS
 *         return sendSMS(data.user.phoneNumber, `Your code: ${data.otp}`);
 *       } else {
 *         // Default to email
 *         return sendEmail(data.user.email, `Your code: ${data.otp}`);
 *       }
 *     }
 *   }
 * })
 * ```
 *
 * @example Client usage with delivery method
 * ```ts
 * // After receiving twoFactorRedirect response with userMetadata:
 * const { userMetadata } = signInResponse.data;
 * if (userMetadata.hasPhoneNumber) {
 *   // Send SMS OTP
 *   await authClient.twoFactor.sendOtp({
 *     fetchOptions: {
 *       query: { otpDeliveryMethod: "sms" }
 *     }
 *   });
 * } else {
 *   // Send email OTP
 *   await authClient.twoFactor.sendOtp({
 *     fetchOptions: {
 *       query: { otpDeliveryMethod: "email" }
 *     }
 *   });
 * }
 * ```
 */
export const twoFactor = <O extends TwoFactorOptions>(options?: O) => {
	const opts = {
		twoFactorTable: "twoFactor",
	};
	const backupCodeOptions = {
		storeBackupCodes: "encrypted",
		...options?.backupCodeOptions,
	} satisfies BackupCodeOptions;

	// Create a wrapper for verifyTwoFactor that passes the options
	const verifyTwoFactorWrapper = (ctx: any) => {
		return verifyTwoFactor(ctx, {
			cookieName: options?.twoFactorState?.cookieName,
			trustDeviceOptions: options?.trustDevice,
			storeStrategy: options?.twoFactorState?.storeStrategy,
		});
	};

	const totp = totp2fa(options?.totpOptions, verifyTwoFactorWrapper);
	const backupCode = backupCode2fa(backupCodeOptions, verifyTwoFactorWrapper);
	const otp = otp2fa(options?.otpOptions, verifyTwoFactorWrapper);

	return {
		id: "two-factor",
		endpoints: {
			...totp.endpoints,
			...otp.endpoints,
			...backupCode.endpoints,
			/**
			 * ### Endpoint
			 *
			 * POST `/two-factor/enable`
			 *
			 * ### API Methods
			 *
			 * **server:**
			 * `auth.api.enableTwoFactor`
			 *
			 * **client:**
			 * `authClient.twoFactor.enable`
			 *
			 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/2fa#api-method-two-factor-enable)
			 */
			enableTwoFactor: createAuthEndpoint(
				"/two-factor/enable",
				{
					method: "POST",
					body: enableTwoFactorBodySchema,
					use: [sessionMiddleware],
					metadata: {
						openapi: {
							summary: "Enable two factor authentication",
							description:
								"Use this endpoint to enable two factor authentication. This will generate a TOTP URI and backup codes. Once the user verifies the TOTP URI, the two factor authentication will be enabled.",
							responses: {
								200: {
									description: "Successful response",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													totpURI: {
														type: "string",
														description: "TOTP URI",
													},
													backupCodes: {
														type: "array",
														items: {
															type: "string",
														},
														description: "Backup codes",
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
					const user = ctx.context.session.user as UserWithTwoFactor;
					const { password, issuer } = ctx.body;
					const isPasswordValid = await validatePassword(ctx, {
						password,
						userId: user.id,
					});
					if (!isPasswordValid) {
						throw APIError.from(
							"BAD_REQUEST",
							BASE_ERROR_CODES.INVALID_PASSWORD,
						);
					}
					const secret = generateRandomString(32);
					const encryptedSecret = await symmetricEncrypt({
						key: ctx.context.secret,
						data: secret,
					});
					const backupCodes = await generateBackupCodes(
						ctx.context.secret,
						backupCodeOptions,
					);

					if (options?.skipVerificationOnEnable) {
						const updatedUser = await ctx.context.internalAdapter.updateUser(
							user.id,
							{
								twoFactorEnabled: true,
							},
						);
						const newSession = await ctx.context.internalAdapter.createSession(
							updatedUser.id,
							false,
							ctx.context.session.session,
						);
						/**
						 * Update the session cookie with the new user data
						 */
						await setSessionCookie(ctx, {
							session: newSession,
							user: updatedUser,
						});
						//remove current session
						await ctx.context.internalAdapter.deleteSession(
							ctx.context.session.session.token,
						);
					}
					//delete existing two factor
					await ctx.context.adapter.deleteMany({
						model: opts.twoFactorTable,
						where: [
							{
								field: "userId",
								value: user.id,
							},
						],
					});

					await ctx.context.adapter.create({
						model: opts.twoFactorTable,
						data: {
							secret: encryptedSecret,
							backupCodes: backupCodes.encryptedBackupCodes,
							userId: user.id,
						},
					});
					const totpURI = createOTP(secret, {
						digits: options?.totpOptions?.digits || 6,
						period: options?.totpOptions?.period,
					}).url(issuer || options?.issuer || ctx.context.appName, user.email);
					return ctx.json({ totpURI, backupCodes: backupCodes.backupCodes });
				},
			),
			/**
			 * ### Endpoint
			 *
			 * POST `/two-factor/disable`
			 *
			 * ### API Methods
			 *
			 * **server:**
			 * `auth.api.disableTwoFactor`
			 *
			 * **client:**
			 * `authClient.twoFactor.disable`
			 *
			 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/2fa#api-method-two-factor-disable)
			 */
			disableTwoFactor: createAuthEndpoint(
				"/two-factor/disable",
				{
					method: "POST",
					body: disableTwoFactorBodySchema,
					use: [sessionMiddleware],
					metadata: {
						openapi: {
							summary: "Disable two factor authentication",
							description:
								"Use this endpoint to disable two factor authentication.",
							responses: {
								200: {
									description: "Successful response",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													status: {
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
					const user = ctx.context.session.user as UserWithTwoFactor;
					const { password } = ctx.body;
					const isPasswordValid = await validatePassword(ctx, {
						password,
						userId: user.id,
					});
					if (!isPasswordValid) {
						throw APIError.from(
							"BAD_REQUEST",
							BASE_ERROR_CODES.INVALID_PASSWORD,
						);
					}
					const updatedUser = await ctx.context.internalAdapter.updateUser(
						user.id,
						{
							twoFactorEnabled: false,
						},
					);
					await ctx.context.adapter.delete({
						model: opts.twoFactorTable,
						where: [
							{
								field: "userId",
								value: updatedUser.id,
							},
						],
					});
					const newSession = await ctx.context.internalAdapter.createSession(
						updatedUser.id,
						false,
						ctx.context.session.session,
					);
					/**
					 * Update the session cookie with the new user data
					 */
					await setSessionCookie(ctx, {
						session: newSession,
						user: updatedUser,
					});
					//remove current session
					await ctx.context.internalAdapter.deleteSession(
						ctx.context.session.session.token,
					);
					return ctx.json({ status: true });
				},
			),
		},
		options: options as NoInfer<O>,
		hooks: {
			after: [
				{
					matcher(context) {
						return (
							context.path === "/sign-in/email" ||
							context.path === "/sign-in/username" ||
							context.path === "/sign-in/phone-number"
						);
					},
					handler: createAuthMiddleware(async (ctx) => {
						const data = ctx.context.newSession;
						if (!data) {
							return;
						}

						if (!data?.user.twoFactorEnabled) {
							return;
						}

						// Skip trust device check if disabled
						if (options?.trustDevice?.disabled) {
							// Proceed with two-factor authentication
						} else {
							// Use custom trust device options or defaults
							const trustDeviceName =
								options?.trustDevice?.name ?? TRUST_DEVICE_COOKIE_NAME;
							const trustDeviceMaxAge =
								options?.trustDevice?.maxAge ?? TRUST_DEVICE_COOKIE_MAX_AGE;

							const trustDeviceCookieAttrs = ctx.context.createAuthCookie(
								trustDeviceName,
								{
									maxAge: trustDeviceMaxAge,
								},
							);
							// Check for trust device cookie
							const trustDeviceCookie = await ctx.getSignedCookie(
								trustDeviceCookieAttrs.name,
								ctx.context.secret,
							);

							if (trustDeviceCookie) {
								const [token, sessionToken] = trustDeviceCookie.split("!");
								const expectedToken = await createHMAC(
									"SHA-256",
									"base64urlnopad",
								).sign(ctx.context.secret, `${data.user.id}!${sessionToken}`);

								// Checks if the token is signed correctly, not that its the current session token
								if (token === expectedToken) {
									// Trust device cookie is valid, refresh it and skip 2FA
									const newTrustDeviceCookie = ctx.context.createAuthCookie(
										trustDeviceName,
										{
											maxAge: trustDeviceMaxAge,
										},
									);
									const newToken = await createHMAC(
										"SHA-256",
										"base64urlnopad",
									).sign(
										ctx.context.secret,
										`${data.user.id}!${data.session.token}`,
									);
									await ctx.setSignedCookie(
										newTrustDeviceCookie.name,
										`${newToken}!${data.session.token}`,
										ctx.context.secret,
										newTrustDeviceCookie.attributes,
									);
									return;
								}
							}
						}

						/**
						 * remove the session cookie. It's set by the sign in credential
						 */
						deleteSessionCookie(ctx, true);
						await ctx.context.internalAdapter.deleteSession(data.session.token);

						// Use custom maxAge from options or default based on OTP period
						const maxAge =
							options?.twoFactorState?.maxAge ??
							(options?.otpOptions?.period ?? 3) * 60; // default 3 minutes

						// Use custom cookie name from options or default
						const cookieName =
							options?.twoFactorState?.cookieName ?? TWO_FACTOR_COOKIE_NAME;

						const twoFactorCookie = ctx.context.createAuthCookie(cookieName, {
							maxAge,
						});

						const identifier = `2fa-${generateRandomString(20)}`;
						const storeStrategy =
							options?.twoFactorState?.storeStrategy ?? "cookie";

						// Store in database if strategy is "database" or "cookieAndDatabase"
						if (
							storeStrategy === "database" ||
							storeStrategy === "cookieAndDatabase"
						) {
							await ctx.context.internalAdapter.createVerificationValue({
								value: data.user.id,
								identifier,
								expiresAt: new Date(Date.now() + maxAge * 1000),
							});
						}

						// Store in cookie if strategy is "cookie" or "cookieAndDatabase"
						if (
							storeStrategy === "cookie" ||
							storeStrategy === "cookieAndDatabase"
						) {
							// For cookie-only, store the user id directly in the verification table
							if (storeStrategy === "cookie") {
								await ctx.context.internalAdapter.createVerificationValue({
									value: data.user.id,
									identifier,
									expiresAt: new Date(Date.now() + maxAge * 1000),
								});
							}
							await ctx.setSignedCookie(
								twoFactorCookie.name,
								identifier,
								ctx.context.secret,
								twoFactorCookie.attributes,
							);
						}

						return ctx.json({
							twoFactorRedirect: true,
							// Return verification token only for database or cookieAndDatabase strategy
							verificationToken:
								storeStrategy === "database" ||
								storeStrategy === "cookieAndDatabase"
									? identifier
									: null,
						});
					}),
				},
			],
		},
		schema: mergeSchema(schema, options?.schema),
		rateLimit: [
			{
				pathMatcher(path) {
					return path.startsWith("/two-factor/");
				},
				window: 10,
				max: 3,
			},
		],
		$ERROR_CODES: TWO_FACTOR_ERROR_CODES,
	} satisfies BetterAuthPlugin;
};

export * from "./client";
export * from "./types";
