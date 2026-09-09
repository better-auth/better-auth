import { createAuthEndpoint } from "@better-auth/core/api";
import { queueAfterTransactionHook } from "@better-auth/core/context";
import { APIError, BASE_ERROR_CODES } from "@better-auth/core/error";
import { createOTP } from "@better-auth/utils/otp";
import * as z from "zod";
import { sessionMiddleware } from "../../../api";
import { symmetricDecrypt } from "../../../crypto";
import { parseUserOutput } from "../../../db/schema";
import { shouldRequirePassword } from "../../../utils/password";
import { PACKAGE_VERSION } from "../../../version";
import type { BackupCodeOptions } from "../backup-codes";
import { DEFAULT_TWO_FACTOR_ALLOWED_ATTEMPTS } from "../constant";
import { TWO_FACTOR_ERROR_CODES } from "../error-code";
import { rotateTwoFactorSession, runTwoFactorMutation } from "../mutation";
import type {
	TwoFactorOptions,
	TwoFactorProvider,
	TwoFactorTable,
	UserWithTwoFactor,
} from "../types";
import {
	assertTwoFactorNotLocked,
	recordTwoFactorFailure,
	resetTwoFactorFailures,
	verifyTwoFactor,
} from "../verify-two-factor";

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

export const totp2fa = (
	options?: TOTPOptions | undefined,
	onEnabled?: TwoFactorOptions["onTotpEnabled"],
) => {
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

	const generateTOTP = createAuthEndpoint.serverOnly(
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
				key: ctx.context.secretConfig,
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
			const { session, valid, invalid, beginAttempt } =
				await verifyTwoFactor(ctx);
			const user = session.user as UserWithTwoFactor;
			const isSignIn = !session.session;
			const twoFactor = await ctx.context.adapter.findOne<TwoFactorTable>({
				model: twoFactorTable,
				where: [{ field: "userId", value: user.id }],
			});

			if (!twoFactor) {
				throw APIError.from(
					"BAD_REQUEST",
					TWO_FACTOR_ERROR_CODES.TOTP_NOT_ENABLED,
				);
			}
			// During sign-in, reject explicitly unverified rows (abandoned enrollments).
			// Using === false instead of !twoFactor.verified so that pre-migration rows
			// where the field is absent/null are treated as verified (legacy-safe).
			if (isSignIn && twoFactor.verified === false) {
				throw APIError.from(
					"BAD_REQUEST",
					TWO_FACTOR_ERROR_CODES.TOTP_NOT_ENABLED,
				);
			}
			if (isSignIn) {
				await assertTwoFactorNotLocked(ctx, twoFactorTable, twoFactor);
			}
			// Enforce the per-challenge attempt budget on the sign-in path. The
			// re-verify branch (already authenticated) is not gated.
			const attempt = isSignIn
				? await beginAttempt(DEFAULT_TWO_FACTOR_ALLOWED_ATTEMPTS)
				: null;
			let status: boolean;
			try {
				const decrypted = await symmetricDecrypt({
					key: ctx.context.secretConfig,
					data: twoFactor.secret,
				});
				status = await createOTP(decrypted, {
					period: opts.period,
					digits: opts.digits,
				}).verify(ctx.body.code);
			} catch (error) {
				// A server error before the code is checked must not spend the slot.
				await attempt?.restore();
				throw error;
			}
			if (!status) {
				await attempt?.recordFailure();
				if (isSignIn) {
					await recordTwoFactorFailure(ctx, twoFactorTable, twoFactor);
				}
				return invalid("INVALID_CODE");
			}
			if (isSignIn) {
				await resetTwoFactorFailures(ctx, twoFactorTable, twoFactor);
			}

			if (!isSignIn) {
				const completed = await runTwoFactorMutation(
					ctx,
					user.id,
					async (currentUser, adapter) => {
						const current = await adapter.findOne<TwoFactorTable>({
							model: twoFactorTable,
							where: [
								{ field: "id", value: twoFactor.id },
								{ field: "userId", value: user.id },
								{ field: "secret", value: twoFactor.secret },
							],
						});
						if (!current)
							throw APIError.from(
								"BAD_REQUEST",
								TWO_FACTOR_ERROR_CODES.FAILED_TO_UPDATE_TWO_FACTOR,
							);
						let activated = false;
						if (current.verified !== true) {
							const count = await adapter.updateMany({
								model: twoFactorTable,
								update: { verified: true },
								where: [
									{ field: "id", value: current.id },
									{ field: "userId", value: user.id },
									{ field: "secret", value: twoFactor.secret },
									{ field: "verified", value: current.verified ?? null },
								],
							});
							if (count !== 1)
								throw APIError.from(
									"BAD_REQUEST",
									TWO_FACTOR_ERROR_CODES.FAILED_TO_UPDATE_TWO_FACTOR,
								);
							const persisted = await adapter.findOne<TwoFactorTable>({
								model: twoFactorTable,
								where: [{ field: "id", value: current.id }],
							});
							if (
								!persisted ||
								persisted.userId !== user.id ||
								persisted.secret !== twoFactor.secret ||
								persisted.verified !== true
							) {
								throw APIError.from(
									"BAD_REQUEST",
									TWO_FACTOR_ERROR_CODES.FAILED_TO_UPDATE_TWO_FACTOR,
								);
							}
							activated = current.verified === false;
						}
						let enabledUser = currentUser;
						let rotatedSession = null;
						if (!currentUser.twoFactorEnabled) {
							if (!session.session)
								throw APIError.from(
									"BAD_REQUEST",
									BASE_ERROR_CODES.FAILED_TO_CREATE_SESSION,
								);
							const updatedUser = await ctx.context.internalAdapter.updateUser(
								user.id,
								{ twoFactorEnabled: true },
							);
							if (
								!updatedUser ||
								updatedUser.id !== user.id ||
								(updatedUser as UserWithTwoFactor).twoFactorEnabled !== true
							) {
								throw APIError.from(
									"BAD_REQUEST",
									BASE_ERROR_CODES.FAILED_TO_UPDATE_USER,
								);
							}
							enabledUser = updatedUser as UserWithTwoFactor;
							rotatedSession = await rotateTwoFactorSession(
								ctx,
								enabledUser,
								session.session,
							);
							activated = true;
						}
						if (activated && onEnabled) {
							await queueAfterTransactionHook(async () => {
								await ctx.context.runInBackgroundOrAwait(
									Promise.resolve().then(() =>
										onEnabled({ user: enabledUser }, ctx.request),
									),
								);
							});
						}
						return { user: enabledUser, session: rotatedSession };
					},
				);
				if (completed.session) {
					return ctx.json({
						token: completed.session.token,
						user: parseUserOutput(ctx.context.options, completed.user),
					});
				}
			}
			return valid(ctx);
		},
	);

	return {
		id: "totp",
		version: PACKAGE_VERSION,
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
