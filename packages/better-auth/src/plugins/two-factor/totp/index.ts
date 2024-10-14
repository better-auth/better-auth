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

export const totp2fa = (options: TOTPOptions, twoFactorTable: string) => {
	const opts = {
		...options,
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
			return {
				totpURI: createTOTPKeyURI(
					options?.issuer || "BetterAuth",
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
				code: z.string(),
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
			if (!twoFactor || !twoFactor.enabled) {
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
