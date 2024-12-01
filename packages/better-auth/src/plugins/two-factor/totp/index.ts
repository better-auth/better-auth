import { APIError } from "better-call";
import { TimeSpan } from "oslo";
import { TOTPController, createTOTPKeyURI } from "oslo/otp";
import { z } from "zod";
import { createAuthEndpoint } from "../../../api/call";
import { sessionMiddleware } from "../../../api";
import { symmetricDecrypt } from "../../../crypto";
import type { BackupCodeOptions } from "../backup-codes";
import { verifyTwoFactorMiddleware } from "../verify-middleware";
import type {
	TwoFactorProvider,
	TwoFactorTable,
	UserWithTwoFactor,
} from "../types";
import { setSessionCookie } from "../../../cookies";

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
};

export const totp2fa = (options: TOTPOptions, twoFactorTable: string) => {
	const opts = {
		...options,
		digits: options?.digits || 6,
		period: new TimeSpan(options?.period || 30, "s"),
	};

	const generateTOTP = createAuthEndpoint(
		"/totp/generate",
		{
			method: "POST",
			use: [sessionMiddleware],
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
			},
		},
		async (ctx) => {
			if (!options) {
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
			if (!twoFactor) {
				throw new APIError("BAD_REQUEST", {
					message: "totp isn't enabled",
				});
			}
			const totp = new TOTPController(opts);
			const code = await totp.generate(Buffer.from(twoFactor.secret));
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
			if (!options) {
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
					message: "totp isn't enabled",
				});
			}
			await ctx.context.password.checkPassword(user.id, ctx);
			return {
				totpURI: createTOTPKeyURI(
					options.issuer || ctx.context.appName,
					user.email,
					Buffer.from(twoFactor.secret),
					opts,
				),
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
			}),
			use: [verifyTwoFactorMiddleware],
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
			if (!options) {
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

			if (!twoFactor) {
				throw new APIError("BAD_REQUEST", {
					message: "totp isn't enabled",
				});
			}
			const totp = new TOTPController(opts);
			const decrypted = await symmetricDecrypt({
				key: ctx.context.secret,
				data: twoFactor.secret,
			});
			const secret = Buffer.from(decrypted);
			const status = await totp.verify(ctx.body.code, secret);
			if (!status) {
				return ctx.context.invalid();
			}

			if (!user.twoFactorEnabled) {
				const updatedUser = await ctx.context.internalAdapter.updateUser(
					user.id,
					{
						twoFactorEnabled: true,
					},
				);
				const newSession = await ctx.context.internalAdapter
					.createSession(
						user.id,
						ctx.request,
						false,
						ctx.context.session.session,
					)
					.catch((e) => {
						console.log(e);
						throw e;
					});

				await ctx.context.internalAdapter.deleteSession(
					ctx.context.session.session.token,
				);
				await setSessionCookie(ctx, {
					session: newSession,
					user: updatedUser,
				});
			}

			return ctx.context.valid();
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
