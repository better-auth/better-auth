import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError, BASE_ERROR_CODES } from "@better-auth/core/error";
import { createOTP } from "@better-auth/utils/otp";
import * as z from "zod";
import { sessionMiddleware } from "../../../api";
import { setSessionCookie } from "../../../cookies";
import { symmetricDecrypt } from "../../../crypto";
import { shouldRequirePassword } from "../../../utils/password";
import type { BackupCodeOptions } from "../backup-codes";
import { TWO_FACTOR_ERROR_CODES } from "../error-code";
import type {
	TwoFactorProvider,
	TwoFactorTable,
	UserWithTwoFactor,
} from "../types";
import { verifyTwoFactor } from "../verify-two-factor";

export type TOTPOptions = {
	/**
	 * Issuer
	 */
	issuer?: string | undefined;
	/**
	 * How many digits the otp to be
	 *
	 * @default 6
	 */
	digits?: (6 | 8) | undefined;
	/**
	 * Period for otp in seconds.
	 * @default 30
	 */
	period?: number | undefined;
	/**
	 * Backup codes configuration
	 */
	backupCodes?: BackupCodeOptions | undefined;
	/**
	 * Allow retrieving the TOTP URI without a password when the user does not
	 * have a credential account.
	 * When enabled, password is still required if a credential account exists.
	 * @default false
	 */
	allowPasswordless?: boolean | undefined;
	/**
	 * Disable totp
	 */
	disable?: boolean | undefined;
};

const generateTOTPBodySchema = z.object({
	secret: z.string().meta({
		description: "The secret to generate the TOTP code",
	}),
});

const verifyTOTPBodySchema = z.object({
	code: z.string().meta({
		description: 'The otp code to verify. Eg: "012345"',
	}),
	/**
	 * if true, the device will be trusted
	 * for 30 days. It'll be refreshed on
	 * every sign in request within this time.
	 */
	trustDevice: z
		.boolean()
		.meta({
			description:
				"If true, the device will be trusted for 30 days. It'll be refreshed on every sign in request within this time. Eg: true",
		})
		.optional(),
});

export const totp2fa = (options?: TOTPOptions | undefined) => {
	const opts = {
		...options,
		digits: options?.digits || 6,
		period: options?.period || 30,
	};
	const passwordSchema = z.string().meta({
		description: "User password",
	});
	const getTOTPURIBodySchema = options?.allowPasswordless
		? z.object({
				password: passwordSchema.optional(),
			})
		: z.object({
				password: passwordSchema,
			});

	const twoFactorTable = "twoFactor";

	const generateTOTP = createAuthEndpoint(
		{
			method: "POST",
			body: generateTOTPBodySchema,
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
			if (options?.disable) {
				ctx.context.logger.error(
					"totp isn't configured. please pass totp option on two factor plugin to enable totp",
				);
				throw APIError.from("BAD_REQUEST", {
					message: "totp isn't configured",
					code: "TOTP_NOT_CONFIGURED",
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
			body: getTOTPURIBodySchema,
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
				throw APIError.from("BAD_REQUEST", {
					message: "totp isn't configured",
					code: "TOTP_NOT_CONFIGURED",
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
				throw APIError.from(
					"BAD_REQUEST",
					TWO_FACTOR_ERROR_CODES.TOTP_NOT_ENABLED,
				);
			}
			const secret = await symmetricDecrypt({
				key: ctx.context.secret,
				data: twoFactor.secret,
			});
			const requirePassword = await shouldRequirePassword(
				ctx,
				user.id,
				options?.allowPasswordless,
			);
			if (requirePassword) {
				if (!ctx.body.password) {
					throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.INVALID_PASSWORD);
				}
				await ctx.context.password.checkPassword(user.id, ctx);
			}
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
			body: verifyTOTPBodySchema,
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
				throw APIError.from("BAD_REQUEST", {
					message: "totp isn't configured",
					code: "TOTP_NOT_CONFIGURED",
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
				throw APIError.from(
					"BAD_REQUEST",
					TWO_FACTOR_ERROR_CODES.TOTP_NOT_ENABLED,
				);
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
					throw APIError.from(
						"BAD_REQUEST",
						BASE_ERROR_CODES.FAILED_TO_CREATE_SESSION,
					);
				}
				const updatedUser = await ctx.context.internalAdapter.updateUser(
					user.id,
					{
						twoFactorEnabled: true,
					},
				);
				const newSession = await ctx.context.internalAdapter
					.createSession(user.id, false, session.session)
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
			/**
			 * ### Endpoint
			 *
			 * POST `/totp/generate`
			 *
			 * ### API Methods
			 *
			 * **server:**
			 * `auth.api.generateTOTP`
			 *
			 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/2fa#totp)
			 */
			generateTOTP: generateTOTP,
			/**
			 * ### Endpoint
			 *
			 * POST `/two-factor/get-totp-uri`
			 *
			 * ### API Methods
			 *
			 * **server:**
			 * `auth.api.getTOTPURI`
			 *
			 * **client:**
			 * `authClient.twoFactor.getTotpUri`
			 *
			 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/2fa#getting-totp-uri)
			 */
			getTOTPURI: getTOTPURI,
			/**
			 * ### Endpoint
			 *
			 * POST `/two-factor/verify-totp`
			 *
			 * ### API Methods
			 *
			 * **server:**
			 * `auth.api.verifyTOTP`
			 *
			 * **client:**
			 * `authClient.twoFactor.verifyTotp`
			 *
			 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/2fa#verifying-totp)
			 */
			verifyTOTP,
		},
	} satisfies TwoFactorProvider;
};
