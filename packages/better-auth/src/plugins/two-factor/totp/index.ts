import { APIError } from "better-call";
import { TimeSpan } from "oslo";
import { TOTPController, createTOTPKeyURI } from "oslo/otp";
import { z } from "zod";
import { createAuthEndpoint } from "../../../api/call";
import { sessionMiddleware } from "../../../api";
import { symmetricDecrypt } from "../../../crypto";
import type { BackupCodeOptions } from "../backup-codes";
import { verifyTwoFactorMiddleware } from "../verify-middleware";
import type { TwoFactorProvider, UserWithTwoFactor } from "../types";

export type TOTPOptions = {
	/**
	 * Issuer
	 */
	issuer: string;
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

export const totp2fa = (options: TOTPOptions) => {
	const opts = {
		digits: 6,
		period: new TimeSpan(options?.period || 30, "s"),
	};

	const generateTOTP = createAuthEndpoint(
		"/totp/generate",
		{
			method: "POST",
			use: [sessionMiddleware],
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
			const session = ctx.context.session.user as UserWithTwoFactor;
			const totp = new TOTPController(opts);
			const code = await totp.generate(Buffer.from(session.twoFactorSecret));
			return { code };
		},
	);

	const getTOTPURI = createAuthEndpoint(
		"/two-factor/get-totp-uri",
		{
			method: "GET",
			use: [sessionMiddleware],
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
			if (!user.twoFactorSecret) {
				throw new APIError("BAD_REQUEST", {
					message: "totp isn't enabled",
				});
			}
			return {
				totpURI: createTOTPKeyURI(
					options?.issuer || "BetterAuth",
					user.email,
					Buffer.from(user.twoFactorSecret),
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
				code: z.string(),
				callbackURL: z.string().optional(),
			}),
			use: [verifyTwoFactorMiddleware],
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
			const totp = new TOTPController(opts);
			const decrypted = await symmetricDecrypt({
				key: ctx.context.secret,
				data: ctx.context.session.user.twoFactorSecret,
			});
			const secret = Buffer.from(decrypted);
			const status = await totp.verify(ctx.body.code, secret);
			if (!status) {
				return ctx.context.invalid();
			}
			return ctx.context.valid();
		},
	);
	return {
		id: "totp",
		endpoints: {
			generateTOTP: generateTOTP,
			viewTOTPURI: getTOTPURI,
			verifyTOTP,
		},
	} satisfies TwoFactorProvider;
};
