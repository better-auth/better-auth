import { APIError } from "better-call";
import { z } from "zod";
import { createAuthEndpoint } from "../../../api/call";
import { sessionMiddleware } from "../../../api";
import { symmetricDecrypt } from "../../../crypto";
import type { BackupCodeOptions } from "../backup-codes";
import { verifyTwoFactor } from "../verify-two-factor";
import type {
	TwoFactorProvider,
	TwoFactorTable,
	UserWithTwoFactor,
} from "../types";
import { setSessionCookie } from "../../../cookies";
import { TWO_FACTOR_ERROR_CODES } from "../error-code";
import { createOTP } from "@better-auth/utils/otp";
import { BASE_ERROR_CODES } from "../../../error/codes";

export type TOTPOptions = {
	/**
	 * Issuer
	 */
	issuer?: string;
	/**
	 * How many digits the otp to be
	 *
	 * @default 6
	 */
	digits?: 6 | 8;
	/**
	 * Period for otp in seconds.
	 * @default 30
	 */
	period?: number;
	/**
	 * Backup codes configuration
	 */
	backupCodes?: BackupCodeOptions;
	/**
	 * Disable totp
	 */
	disable?: boolean;
};

export const totp2fa = (options?: TOTPOptions) => {
	const opts = {
		...options,
		digits: options?.digits || 6,
		period: options?.period || 30,
	};

	const twoFactorTable = "twoFactor";

	const generateTOTP = createAuthEndpoint(
		"/totp/generate",
		{
			method: "POST",
			body: z.object({
				secret: z.string({
					description: "The secret to generate the TOTP code",
				}),
			}),
			metadata: {
				openapi: {
					summary: "Generate TOTP code",
					description: "Use this endpoint to generate a TOTP code",
					responses: {
						200: {
							description: "Successful response",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											code: {
												type: "string",
											},
										},
									},
								},
							},
						},
					},
				},
				SERVER_ONLY: true,
			},
		},
		async (ctx) => {
			if (options?.disable) {
				ctx.context.logger.error(
					"totp isn't configured. please pass totp option on two factor plugin to enable totp",
				);
				throw new APIError("BAD_REQUEST", {
					message: "totp isn't configured",
				});
			}
			const code = await createOTP(ctx.body.secret, {
				period: opts.period,
				digits: opts.digits,
			}).totp();
			return { code };
		},
	);

	const getTOTPURI = createAuthEndpoint(
		"/two-factor/get-totp-uri",
		{
			method: "POST",
			use: [sessionMiddleware],
			body: z.object({
				password: z.string({
					description: "User password",
				}),
			}),
			metadata: {
				openapi: {
					summary: "Get TOTP URI",
					description: "Use this endpoint to get the TOTP URI",
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
			if (options?.disable) {
				ctx.context.logger.error(
					"totp isn't configured. please pass totp option on two factor plugin to enable totp",
				);
				throw new APIError("BAD_REQUEST", {
					message: "totp isn't configured",
				});
			}
			const user = ctx.context.session.user as UserWithTwoFactor;
			const twoFactor = await ctx.context.adapter.findOne<TwoFactorTable>({
				model: twoFactorTable,
				where: [
					{
						field: "userId",
						value: user.id,
					},
				],
			});
			if (!twoFactor || !user.twoFactorEnabled) {
				throw new APIError("BAD_REQUEST", {
					message: TWO_FACTOR_ERROR_CODES.TOTP_NOT_ENABLED,
				});
			}
			const secret = await symmetricDecrypt({
				key: ctx.context.secret,
				data: twoFactor.secret,
			});
			await ctx.context.password.checkPassword(user.id, ctx);
			const totpURI = createOTP(secret, {
				digits: opts.digits,
				period: opts.period,
			}).url(options?.issuer || ctx.context.appName, user.email);
			return {
				totpURI,
			};
		},
	);

	const verifyTOTP = createAuthEndpoint(
		"/two-factor/verify-totp",
		{
			method: "POST",
			body: z.object({
				code: z.string({
					description: "The otp code to verify",
				}),
				/**
				 * if true, the device will be trusted
				 * for 30 days. It'll be refreshed on
				 * every sign in request within this time.
				 */
				trustDevice: z
					.boolean({
						description:
							"If true, the device will be trusted for 30 days. It'll be refreshed on every sign in request within this time.",
					})
					.optional(),
			}),
			metadata: {
				openapi: {
					summary: "Verify two factor TOTP",
					description: "Verify two factor TOTP",
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
			if (options?.disable) {
				ctx.context.logger.error(
					"totp isn't configured. please pass totp option on two factor plugin to enable totp",
				);
				throw new APIError("BAD_REQUEST", {
					message: "totp isn't configured",
				});
			}
			const { session, valid, invalid } = await verifyTwoFactor(ctx);
			const user = session.user as UserWithTwoFactor;
			const twoFactor = await ctx.context.adapter.findOne<TwoFactorTable>({
				model: twoFactorTable,
				where: [
					{
						field: "userId",
						value: user.id,
					},
				],
			});

			if (!twoFactor) {
				throw new APIError("BAD_REQUEST", {
					message: TWO_FACTOR_ERROR_CODES.TOTP_NOT_ENABLED,
				});
			}
			const decrypted = await symmetricDecrypt({
				key: ctx.context.secret,
				data: twoFactor.secret,
			});
			const status = await createOTP(decrypted, {
				period: opts.period,
				digits: opts.digits,
			}).verify(ctx.body.code);
			if (!status) {
				return invalid("INVALID_CODE");
			}

			if (!user.twoFactorEnabled) {
				if (!session.session) {
					throw new APIError("BAD_REQUEST", {
						message: BASE_ERROR_CODES.FAILED_TO_CREATE_SESSION,
					});
				}
				const updatedUser = await ctx.context.internalAdapter.updateUser(
					user.id,
					{
						twoFactorEnabled: true,
					},
					ctx,
				);
				const newSession = await ctx.context.internalAdapter
					.createSession(user.id, ctx, false, session.session)
					.catch((e) => {
						throw e;
					});

				await ctx.context.internalAdapter.deleteSession(session.session.token);
				await setSessionCookie(ctx, {
					session: newSession,
					user: updatedUser,
				});
			}
			return valid(ctx);
		},
	);
	return {
		id: "totp",
		endpoints: {
			generateTOTP: generateTOTP,
			getTOTPURI: getTOTPURI,
			verifyTOTP,
		},
	} satisfies TwoFactorProvider;
};
