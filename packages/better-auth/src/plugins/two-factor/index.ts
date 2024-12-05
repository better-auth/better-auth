import { alphabet, generateRandomString } from "../../crypto/random";
import { z } from "zod";
import { createAuthEndpoint, createAuthMiddleware } from "../../api/call";
import { sessionMiddleware } from "../../api";
import { hs256, symmetricEncrypt } from "../../crypto";
import type { BetterAuthPlugin } from "../../types/plugins";
import { backupCode2fa, generateBackupCodes } from "./backup-codes";
import { otp2fa } from "./otp";
import { totp2fa } from "./totp";
import type { TwoFactorOptions, UserWithTwoFactor } from "./types";
import { mergeSchema, type Session } from "../../db/schema";
import { TWO_FACTOR_COOKIE_NAME, TRUST_DEVICE_COOKIE_NAME } from "./constant";
import { validatePassword } from "../../utils/password";
import { APIError } from "better-call";
import { createTOTPKeyURI } from "oslo/otp";
import { TimeSpan } from "oslo";
import { deleteSessionCookie, setSessionCookie } from "../../cookies";
import { getEndpointResponse } from "../../utils/plugin-helper";
import { schema } from "./schema";
import { BASE_ERROR_CODES } from "../../error/codes";

export const twoFactor = (options?: TwoFactorOptions) => {
	const opts = {
		twoFactorTable: "twoFactor",
	};
	const totp = totp2fa(
		{
			issuer: options?.issuer,
			...options?.totpOptions,
		},
		opts.twoFactorTable,
	);
	const backupCode = backupCode2fa(
		{
			...options?.backupCodeOptions,
		},
		opts.twoFactorTable,
	);
	const otp = otp2fa(
		{
			...options?.otpOptions,
		},
		opts.twoFactorTable,
	);

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
						password: z
							.string({
								description: "User password",
							})
							.min(8),
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
					const { password } = ctx.body;
					const isPasswordValid = await validatePassword(ctx, {
						password,
						userId: user.id,
					});
					if (!isPasswordValid) {
						throw new APIError("BAD_REQUEST", {
							message: BASE_ERROR_CODES.INVALID_PASSWORD,
						});
					}
					const secret = generateRandomString(16, alphabet("a-z", "0-9", "-"));
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
						);
						const newSession = await ctx.context.internalAdapter.createSession(
							updatedUser.id,
							ctx.request,
							false,
							ctx.context.session.session,
						);
						/**
						 * Update the session cookie with the new user data
						 */
						await setSessionCookie(ctx, {
							session: newSession,
							user,
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
					const totpURI = createTOTPKeyURI(
						options?.issuer || "BetterAuth",
						user.email,
						Buffer.from(secret),
						{
							digits: options?.totpOptions?.digits || 6,
							period: new TimeSpan(options?.totpOptions?.period || 30, "s"),
						},
					);
					return ctx.json({ totpURI, backupCodes: backupCodes.backupCodes });
				},
			),
			disableTwoFactor: createAuthEndpoint(
				"/two-factor/disable",
				{
					method: "POST",
					body: z.object({
						password: z
							.string({
								description: "User password",
							})
							.min(8),
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
					await ctx.context.internalAdapter.updateUser(user.id, {
						twoFactorEnabled: false,
					});
					await ctx.context.adapter.delete({
						model: opts.twoFactorTable,
						where: [
							{
								field: "userId",
								value: user.id,
							},
						],
					});
					const newSession = await ctx.context.internalAdapter.createSession(
						user.id,
						ctx.request,
						false,
						ctx.context.session.session,
					);
					/**
					 * Update the session cookie with the new user data
					 */
					await setSessionCookie(ctx, {
						session: newSession,
						user,
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
							context.path === "/sign-in/username"
						);
					},
					handler: createAuthMiddleware(async (ctx) => {
						const response = await getEndpointResponse<{
							user: UserWithTwoFactor;
							session: Session;
						}>(ctx);
						if (!response) {
							return;
						}
						if (!response.user.twoFactorEnabled) {
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
							const expectedToken = await hs256(
								ctx.context.secret,
								`${response.user.id}!${sessionToken}`,
							);

							if (token === expectedToken) {
								// Trust device cookie is valid, refresh it and skip 2FA
								const newToken = await hs256(
									ctx.context.secret,
									`${response.user.id}!${response.session.token}`,
								);
								await ctx.setSignedCookie(
									trustDeviceCookieName.name,
									`${newToken}!${response.session.token}`,
									ctx.context.secret,
									trustDeviceCookieName.attributes,
								);
								return;
							}
						}

						/**
						 * remove the session cookie. It's set by the sign in credential
						 */
						deleteSessionCookie(ctx);
						await ctx.context.internalAdapter.deleteSession(
							response.session.token,
						);
						const twoFactorCookie = ctx.context.createAuthCookie(
							TWO_FACTOR_COOKIE_NAME,
							{
								maxAge: 60 * 10, // 10 minutes
							},
						);
						/**
						 * We set the user id and the session
						 * id as a hash. Later will fetch for
						 * sessions with the user id compare
						 * the hash and set that as session.
						 */
						await ctx.setSignedCookie(
							twoFactorCookie.name,
							response.user.id,
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
	} satisfies BetterAuthPlugin;
};

export * from "./client";
