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
	expireCookie,
	setSessionCookie,
} from "../../cookies";
import { symmetricEncrypt } from "../../crypto";
import { generateRandomString } from "../../crypto/random";
import { mergeSchema } from "../../db/schema";
import { shouldRequirePassword, validatePassword } from "../../utils/password";
import { PACKAGE_VERSION } from "../../version";
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
import type {
	TwoFactorOptions,
	TwoFactorTable,
	UserWithTwoFactor,
} from "./types";

export * from "./error-code";

declare module "@better-auth/core" {
	interface BetterAuthPluginRegistry<AuthOptions, Options> {
		"two-factor": {
			creator: typeof twoFactor;
		};
	}
}
export const twoFactor = <O extends TwoFactorOptions>(options?: O) => {
	const opts = {
		twoFactorTable: "twoFactor",
	};
	const trustDeviceMaxAge =
		options?.trustDeviceMaxAge ?? TRUST_DEVICE_COOKIE_MAX_AGE;
	const allowPasswordless = options?.allowPasswordless;
	const backupCodeOptions = {
		storeBackupCodes: "encrypted",
		...options?.backupCodeOptions,
	} satisfies BackupCodeOptions;
	const totp = totp2fa({
		...options?.totpOptions,
		allowPasswordless:
			options?.totpOptions?.allowPasswordless ?? allowPasswordless,
	});
	const backupCode = backupCode2fa({
		...backupCodeOptions,
		allowPasswordless:
			options?.backupCodeOptions?.allowPasswordless ?? allowPasswordless,
	});
	const otp = otp2fa(options?.otpOptions);
	const passwordSchema = z.string().meta({
		description: "User password",
	});
	const methodField = z.enum(["otp", "totp"]).default("totp").meta({
		description:
			"The 2FA method to enable. 'totp' generates an authenticator app secret (requires verification). 'otp' enables email/SMS-based codes immediately.",
	});
	const issuerField = z
		.string()
		.meta({
			description: "Custom issuer for the TOTP URI",
		})
		.optional();
	const enableTwoFactorBodySchema = allowPasswordless
		? z.object({
				password: passwordSchema.optional(),
				method: methodField,
				issuer: issuerField,
			})
		: z.object({
				password: passwordSchema,
				method: methodField,
				issuer: issuerField,
			});
	const disableTwoFactorBodySchema = allowPasswordless
		? z.object({
				password: passwordSchema.optional(),
			})
		: z.object({
				password: passwordSchema,
			});

	return {
		id: "two-factor",
		version: PACKAGE_VERSION,
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
								"Enable two factor authentication. Pass method 'totp' (default) to generate a TOTP URI for authenticator apps, or 'otp' to enable email/SMS-based codes immediately. Both methods return backup codes.",
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
														description:
															"TOTP URI for authenticator app setup (only present when method is 'totp')",
													},
													backupCodes: {
														type: "array",
														items: {
															type: "string",
														},
														description: "Recovery backup codes",
													},
												},
												required: ["backupCodes"],
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
					const { password, issuer, method } = ctx.body;
					const requirePassword = await shouldRequirePassword(
						ctx,
						user.id,
						allowPasswordless,
					);
					if (requirePassword) {
						if (!password) {
							throw APIError.from(
								"BAD_REQUEST",
								BASE_ERROR_CODES.INVALID_PASSWORD,
							);
						}
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
					}

					if (method === "otp" && !options?.otpOptions?.sendOTP) {
						throw APIError.from(
							"BAD_REQUEST",
							TWO_FACTOR_ERROR_CODES.OTP_NOT_CONFIGURED,
						);
					}
					if (method === "totp" && options?.totpOptions?.disable) {
						throw APIError.from(
							"BAD_REQUEST",
							TWO_FACTOR_ERROR_CODES.TOTP_NOT_CONFIGURED,
						);
					}

					const backupCodes = await generateBackupCodes(
						ctx.context.secretConfig,
						backupCodeOptions,
					);

					const existingTwoFactor =
						await ctx.context.adapter.findOne<TwoFactorTable>({
							model: opts.twoFactorTable,
							where: [{ field: "userId", value: user.id }],
						});
					await ctx.context.adapter.deleteMany({
						model: opts.twoFactorTable,
						where: [{ field: "userId", value: user.id }],
					});

					if (method === "otp") {
						await ctx.context.adapter.create({
							model: opts.twoFactorTable,
							data: {
								secret: null,
								backupCodes: backupCodes.encryptedBackupCodes,
								userId: user.id,
								verified: false,
							},
						});
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
						await setSessionCookie(ctx, {
							session: newSession,
							user: updatedUser,
						});
						await ctx.context.internalAdapter.deleteSession(
							ctx.context.session.session.token,
						);
						return ctx.json({
							totpURI: null,
							backupCodes: backupCodes.backupCodes,
						});
					}

					const secret = generateRandomString(32);
					const encryptedSecret = await symmetricEncrypt({
						key: ctx.context.secretConfig,
						data: secret,
					});
					await ctx.context.adapter.create({
						model: opts.twoFactorTable,
						data: {
							secret: encryptedSecret,
							backupCodes: backupCodes.encryptedBackupCodes,
							userId: user.id,
							verified:
								existingTwoFactor != null &&
								existingTwoFactor.verified !== false,
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
					const requirePassword = await shouldRequirePassword(
						ctx,
						user.id,
						allowPasswordless,
					);
					if (requirePassword) {
						if (!password) {
							throw APIError.from(
								"BAD_REQUEST",
								BASE_ERROR_CODES.INVALID_PASSWORD,
							);
						}
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
					const disableTrustCookie = ctx.context.createAuthCookie(
						TRUST_DEVICE_COOKIE_NAME,
						{
							maxAge: trustDeviceMaxAge,
						},
					);
					const disableTrustValue = await ctx.getSignedCookie(
						disableTrustCookie.name,
						ctx.context.secret,
					);
					if (disableTrustValue) {
						const [, trustId] = disableTrustValue.split("!");
						if (trustId) {
							await ctx.context.internalAdapter.deleteVerificationByIdentifier(
								trustId,
							);
						}
						expireCookie(ctx, disableTrustCookie);
					}
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

						const trustDeviceCookieAttrs = ctx.context.createAuthCookie(
							TRUST_DEVICE_COOKIE_NAME,
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
							const [token, trustIdentifier] = trustDeviceCookie.split("!");
							if (token && trustIdentifier) {
								const expectedToken = await createHMAC(
									"SHA-256",
									"base64urlnopad",
								).sign(
									ctx.context.secret,
									`${data.user.id}!${trustIdentifier}`,
								);

								if (token === expectedToken) {
									// HMAC is valid; verify the server-side record
									const verificationRecord =
										await ctx.context.internalAdapter.findVerificationValue(
											trustIdentifier,
										);
									if (
										verificationRecord &&
										verificationRecord.value === data.user.id &&
										verificationRecord.expiresAt > new Date()
									) {
										await ctx.context.internalAdapter.deleteVerificationByIdentifier(
											trustIdentifier,
										);
										const newTrustIdentifier = `trust-device-${generateRandomString(32)}`;
										const newToken = await createHMAC(
											"SHA-256",
											"base64urlnopad",
										).sign(
											ctx.context.secret,
											`${data.user.id}!${newTrustIdentifier}`,
										);
										await ctx.context.internalAdapter.createVerificationValue({
											value: data.user.id,
											identifier: newTrustIdentifier,
											expiresAt: new Date(
												Date.now() + trustDeviceMaxAge * 1000,
											),
										});
										const newTrustDeviceCookie = ctx.context.createAuthCookie(
											TRUST_DEVICE_COOKIE_NAME,
											{
												maxAge: trustDeviceMaxAge,
											},
										);
										await ctx.setSignedCookie(
											newTrustDeviceCookie.name,
											`${newToken}!${newTrustIdentifier}`,
											ctx.context.secret,
											trustDeviceCookieAttrs.attributes,
										);
										return;
									}
								}
							}
							expireCookie(ctx, trustDeviceCookieAttrs);
						}

						/**
						 * remove the session cookie. It's set by the sign in credential
						 */
						deleteSessionCookie(ctx, true);
						await ctx.context.internalAdapter.deleteSession(data.session.token);
						const maxAge = options?.twoFactorCookieMaxAge ?? 10 * 60; // 10 minutes
						const twoFactorCookie = ctx.context.createAuthCookie(
							TWO_FACTOR_COOKIE_NAME,
							{
								maxAge,
							},
						);
						const identifier = `2fa-${generateRandomString(20)}`;
						await ctx.context.internalAdapter.createVerificationValue({
							value: data.user.id,
							identifier,
							expiresAt: new Date(Date.now() + maxAge * 1000),
						});
						await ctx.setSignedCookie(
							twoFactorCookie.name,
							identifier,
							ctx.context.secret,
							twoFactorCookie.attributes,
						);
						const twoFactorMethods: string[] = [];

						/**
						 * totp requires per-user setup, so we check
						 * that the user actually has a secret stored.
						 */
						if (!options?.totpOptions?.disable) {
							const userTotpSecret =
								await ctx.context.adapter.findOne<TwoFactorTable>({
									model: opts.twoFactorTable,
									where: [
										{
											field: "userId",
											value: data.user.id,
										},
									],
								});
							if (
								userTotpSecret &&
								userTotpSecret.secret &&
								userTotpSecret.verified !== false
							) {
								twoFactorMethods.push("totp");
							}
						}

						/**
						 * otp is server-level — if sendOTP is configured,
						 * any user with 2fa enabled can receive a code.
						 */
						if (options?.otpOptions?.sendOTP) {
							twoFactorMethods.push("otp");
						}

						return ctx.json({
							twoFactorRedirect: true,
							twoFactorMethods,
						});
					}),
				},
			],
		},
		schema: mergeSchema(schema, {
			...options?.schema,
			twoFactor: {
				...options?.schema?.twoFactor,
				...(options?.twoFactorTable
					? { modelName: options.twoFactorTable }
					: {}),
			},
		}),
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
