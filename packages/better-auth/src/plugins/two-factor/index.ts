import { generateRandomString } from "../../crypto/random";
import { z } from "zod";
import { createAuthEndpoint, createAuthMiddleware } from "../../api/call";
import { sessionMiddleware } from "../../api";
import { symmetricEncrypt } from "../../crypto";
import type { BetterAuthPlugin } from "../../types/plugins";
import { backupCode2fa, generateBackupCodes } from "./backup-codes";
import { otp2fa } from "./otp";
import { totp2fa } from "./totp";
import type { TwoFactorOptions, UserWithTwoFactor } from "./types";
import { mergeSchema } from "../../db/schema";
import { TWO_FACTOR_COOKIE_NAME, TRUST_DEVICE_COOKIE_NAME } from "./constant";
import { validatePassword } from "../../utils/password";
import { APIError } from "better-call";
import { deleteSessionCookie, setSessionCookie } from "../../cookies";
import { schema } from "./schema";
import { BASE_ERROR_CODES } from "../../error/codes";
import { createOTP } from "@better-auth/utils/otp";
import { createHMAC } from "@better-auth/utils/hmac";
import { TWO_FACTOR_ERROR_CODES } from "./error-code";
export * from "./error-code";

export const twoFactor = (options?: TwoFactorOptions) => {
	const opts = {
		twoFactorTable: "twoFactor",
	};
	const totp = totp2fa(options?.totpOptions);
	const backupCode = backupCode2fa(options?.backupCodeOptions);
	const otp = otp2fa(options?.otpOptions);

	return {
		id: "two-factor",
		endpoints: {
			...totp.endpoints,
			...otp.endpoints,
			...backupCode.endpoints,
			enableTwoFactor: createAuthEndpoint(
				"/two-factor/enable",
				{
					method: "POST",
					body: z.object({
						password: z.string({
							description: "User password",
						}),
						issuer: z
							.string({
								description: "Custom issuer for the TOTP URI",
							})
							.optional(),
					}),
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
						throw new APIError("BAD_REQUEST", {
							message: BASE_ERROR_CODES.INVALID_PASSWORD,
						});
					}
					const secret = generateRandomString(32);
					const encryptedSecret = await symmetricEncrypt({
						key: ctx.context.secret,
						data: secret,
					});
					const backupCodes = await generateBackupCodes(
						ctx.context.secret,
						options?.backupCodeOptions,
					);
					if (options?.skipVerificationOnEnable) {
						const updatedUser = await ctx.context.internalAdapter.updateUser(
							user.id,
							{
								twoFactorEnabled: true,
							},
							ctx,
						);
						const newSession = await ctx.context.internalAdapter.createSession(
							updatedUser.id,
							ctx,
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
			disableTwoFactor: createAuthEndpoint(
				"/two-factor/disable",
				{
					method: "POST",
					body: z.object({
						password: z.string({
							description: "User password",
						}),
					}),
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
						throw new APIError("BAD_REQUEST", {
							message: "Invalid password",
						});
					}
					const updatedUser = await ctx.context.internalAdapter.updateUser(
						user.id,
						{
							twoFactorEnabled: false,
						},
						ctx,
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
						ctx,
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
		options: options,
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
						// Check for trust device cookie
						const trustDeviceCookieName = ctx.context.createAuthCookie(
							TRUST_DEVICE_COOKIE_NAME,
						);
						const trustDeviceCookie = await ctx.getSignedCookie(
							trustDeviceCookieName.name,
							ctx.context.secret,
						);
						if (trustDeviceCookie) {
							const [token, sessionToken] = trustDeviceCookie.split("!");
							const expectedToken = await createHMAC(
								"SHA-256",
								"base64urlnopad",
							).sign(ctx.context.secret, `${data.user.id}!${sessionToken}`);

							if (token === expectedToken) {
								// Trust device cookie is valid, refresh it and skip 2FA
								const newToken = await createHMAC(
									"SHA-256",
									"base64urlnopad",
								).sign(ctx.context.secret, `${data.user.id}!${sessionToken}`);
								await ctx.setSignedCookie(
									trustDeviceCookieName.name,
									`${newToken}!${data.session.token}`,
									ctx.context.secret,
									trustDeviceCookieName.attributes,
								);
								return;
							}
						}

						/**
						 * remove the session cookie. It's set by the sign in credential
						 */
						deleteSessionCookie(ctx, true);
						await ctx.context.internalAdapter.deleteSession(data.session.token);
						const maxAge = options?.otpOptions?.period || 60 * 5; // 5 minutes
						const twoFactorCookie = ctx.context.createAuthCookie(
							TWO_FACTOR_COOKIE_NAME,
							{
								maxAge,
							},
						);
						const identifier = `2fa-${generateRandomString(20)}`;
						await ctx.context.internalAdapter.createVerificationValue(
							{
								value: data.user.id,
								identifier,
								expiresAt: new Date(Date.now() + maxAge * 1000),
							},
							ctx,
						);
						await ctx.setSignedCookie(
							twoFactorCookie.name,
							identifier,
							ctx.context.secret,
							twoFactorCookie.attributes,
						);
						return ctx.json({
							twoFactorRedirect: true,
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
