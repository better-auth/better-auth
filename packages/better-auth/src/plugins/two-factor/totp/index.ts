import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError, BASE_ERROR_CODES } from "@better-auth/core/error";
import { createOTP } from "@better-auth/utils/otp";
import * as z from "zod";
import { sessionMiddleware } from "../../../api";
import { setSessionCookie } from "../../../cookies";
import { constantTimeEqual, symmetricDecrypt } from "../../../crypto";
import { shouldRequirePassword } from "../../../utils/password";
import { PACKAGE_VERSION } from "../../../version";
import type { BackupCodeOptions } from "../backup-codes";
import { DEFAULT_TWO_FACTOR_ALLOWED_ATTEMPTS } from "../constant";
import { TWO_FACTOR_ERROR_CODES } from "../error-code";
import type {
	TwoFactorProvider,
	TwoFactorTable,
	UserWithTwoFactor,
} from "../types";
import type { TwoFactorValidSignal } from "../verify-two-factor";
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
			let replayIdToClean: string | null = null;
			let status = false;
			try {
				const decrypted = await symmetricDecrypt({
					key: ctx.context.secretConfig,
					data: twoFactor.secret,
				});
				const otp = createOTP(decrypted, {
					period: opts.period,
					digits: opts.digits,
				});
				let matchedStep: number | null = null;
				const currentStep = Math.floor(Date.now() / (opts.period * 1000));
				for (let offset = -1; offset <= 1; offset++) {
					const candidateStep = currentStep + offset;
					// cspell:ignore hotp
					const candidateCode = await otp.hotp(candidateStep);
					if (constantTimeEqual(candidateCode, ctx.body.code)) {
						matchedStep ??= candidateStep;
					}
				}
				const shouldReserve =
					isSignIn ||
					twoFactor.verified === true ||
					(user.twoFactorEnabled && twoFactor.verified !== false);

				if (matchedStep === null) {
					status = false;
				} else if (shouldReserve) {
					const expiresAt = new Date((matchedStep + 2) * opts.period * 1000);
					// Step-keyed tombstone: steps are unique, so no pre-reserve
					// cleanup is needed and adjacent-step collisions cannot false-block.
					const replayId = `totp-used:${twoFactor.id}:${matchedStep}`;
					let reserved = false;
					if (
						ctx.context.secondaryStorage &&
						!ctx.context.options.verification?.storeInDatabase
					) {
						const ttlSeconds = Math.max(
							1,
							Math.ceil((expiresAt.getTime() - Date.now()) / 1000),
						);
						reserved =
							(await ctx.context.secondaryStorage.increment(
								replayId,
								ttlSeconds,
							)) === 1;
					} else {
						// Atomic first-writer-wins gate (no read-modify-write):
						// losers observe the consumed step as INVALID_CODE.
						reserved =
							await ctx.context.internalAdapter.reserveVerificationValue({
								identifier: replayId,
								value: "used",
								expiresAt,
							});
					}
					status = reserved;
					if (reserved) {
						replayIdToClean = replayId;
					}
					if (reserved && !ctx.context.options.verification?.disableCleanup) {
						// Best-effort maintenance: a successful reservation keeps its
						// tombstone until expiry (replay protection), and the step-up
						// path never reads verification rows, so nothing else sweeps
						// them. Opportunistically delete expired rows so repeated
						// step-up use cannot grow the table without bound.
						// Fire-and-forget: never blocks or fails verification.
						try {
							ctx.context.adapter
								.deleteMany({
									model: "verification",
									where: [
										{ field: "expiresAt", value: new Date(), operator: "lt" },
									],
								})
								.catch(() => {});
						} catch {}
					}
				} else {
					// Enrollment verification claims no marker (nothing consumed yet);
					// single-use applies from the next verification on.
					status = true;
				}
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

			const sessionSignal: TwoFactorValidSignal = {};
			try {
				if (isSignIn) {
					await resetTwoFactorFailures(ctx, twoFactorTable, twoFactor);
				}

				// Enrollment: fresh setup, OTP-only accounts adding TOTP, and
				// pre-migration rows with verified null/undefined.
				if (twoFactor.verified !== true) {
					if (!user.twoFactorEnabled) {
						// session.session is guaranteed non-null here: the sign-in guard
						// above already rejected isSignIn && verified === false.
						const activeSession = session.session!;
						const updatedUser = await ctx.context.internalAdapter.updateUser(
							user.id,
							{
								twoFactorEnabled: true,
							},
						);
						const newSession = await ctx.context.internalAdapter.createSession(
							user.id,
							false,
							activeSession,
						);

						await setSessionCookie(ctx, {
							session: newSession,
							user: updatedUser,
						});
						await ctx.context.internalAdapter.deleteSession(
							activeSession.token,
						);
					}
					// Mark verified only after session ops succeed: retry-safe, and a
					// partial failure cannot leave verified=true with twoFactorEnabled=false.
					await ctx.context.adapter.update({
						model: twoFactorTable,
						update: { verified: true },
						where: [{ field: "id", value: twoFactor.id }],
					});
				}
				// valid() flips sessionSignal once the session row exists.
				// Pre-session failures roll back below; post-session ones
				// keep the marker (rollback would mint a second session).
				const result = await valid(ctx, sessionSignal);
				replayIdToClean = null;
				return result;
			} catch (error) {
				if (replayIdToClean && !sessionSignal.sessionIssued) {
					// Pre-session failure spent no session: return the slot so
					// a transient error does not burn the code on retry.
					await attempt?.restore();
					if (
						ctx.context.secondaryStorage &&
						!ctx.context.options.verification?.storeInDatabase
					) {
						try {
							await ctx.context.secondaryStorage.delete(replayIdToClean);
						} catch {}
					} else {
						await ctx.context.internalAdapter
							.deleteVerificationByIdentifier(replayIdToClean)
							.catch(() => {});
					}
				}
				throw error;
			}
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
