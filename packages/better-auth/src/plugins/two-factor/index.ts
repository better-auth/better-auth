import type { BetterAuthPlugin } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError, BASE_ERROR_CODES } from "@better-auth/core/error";
import { createOTP } from "@better-auth/utils/otp";
import * as z from "zod";
import { sensitiveSessionMiddleware } from "../../api";
import { expireCookie, setSessionCookie } from "../../cookies";
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
export type {
	CompleteResolver,
	ManagementResolver,
	TwoFactorResolver,
	TwoFactorVerifyResponse,
} from "./verify-two-factor";

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
		options?.trustDevice?.maxAge ?? TRUST_DEVICE_COOKIE_MAX_AGE;
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
	const enableTwoFactorBodySchema = allowPasswordless
		? z.object({
				password: passwordSchema.optional(),
				issuer: z
					.string()
					.meta({
						description: "Custom issuer for the TOTP URI",
					})
					.optional(),
			})
		: z.object({
				password: passwordSchema,
				issuer: z
					.string()
					.meta({
						description: "Custom issuer for the TOTP URI",
					})
					.optional(),
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
		signInChallenges: ["two-factor"] as const,
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
					use: [sensitiveSessionMiddleware],
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
					const secret = generateRandomString(32);
					const encryptedSecret = await symmetricEncrypt({
						key: ctx.context.secretConfig,
						data: secret,
					});
					const backupCodes = await generateBackupCodes(
						ctx.context.secretConfig,
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
					const existingTwoFactor =
						await ctx.context.adapter.findOne<TwoFactorTable>({
							model: opts.twoFactorTable,
							where: [{ field: "userId", value: user.id }],
						});
					await ctx.context.adapter.deleteMany({
						model: opts.twoFactorTable,
						where: [{ field: "userId", value: user.id }],
					});

					await ctx.context.adapter.create({
						model: opts.twoFactorTable,
						data: {
							secret: encryptedSecret,
							backupCodes: backupCodes.encryptedBackupCodes,
							userId: user.id,
							verified:
								(existingTwoFactor != null &&
									existingTwoFactor.verified !== false) ||
								!!options?.skipVerificationOnEnable,
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
					use: [sensitiveSessionMiddleware],
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
