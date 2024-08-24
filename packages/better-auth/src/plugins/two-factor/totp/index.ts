import { TimeSpan } from "oslo";
import { alphabet, generateRandomString } from "oslo/crypto";
import { TOTPController, createTOTPKeyURI } from "oslo/otp";
import { z } from "zod";
import { createAuthEndpoint } from "../../../api/call";
import { sessionMiddleware } from "../../../api/middlewares/session";
import { APIError } from "better-call";
import { TwoFactorProvider, UserWithTwoFactor } from "../types";
import { verifyTwoFactorMiddleware } from "../verify-middleware";
import { BackupCodeOptions, generateBackupCodes } from "../backup-codes";
import { symmetricDecrypt } from "../../../crypto";

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
		secret: {
			field: "twoFactorSecret",
		},
	};

	const enableTOTP = createAuthEndpoint(
		"/enable/totp",
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
			const secret = generateRandomString(16, alphabet("a-z", "0-9", "-"));
			const user = ctx.context.session.user as UserWithTwoFactor;
			const uri = createTOTPKeyURI(
				options.issuer || "BetterAuth",
				user.name,
				Buffer.from(secret),
				opts,
			);
			const backupCodes = await generateBackupCodes(
				secret,
				options.backupCodes,
			);
			await ctx.context.adapter.update({
				model: "user",
				update: {
					twoFactorSecret: secret,
					twoFactorEnabled: true,
					backupCodes: backupCodes.encryptedBackupCodes,
				},
				where: [
					{
						field: "id",
						value: user.id,
					},
				],
			});
			return ctx.json({ uri, backupCodes: backupCodes.backupCodes });
		},
	);

	async function enable(user: UserWithTwoFactor) {
		const secret = generateRandomString(16, alphabet("a-z", "0-9", "-"));
		const uri = createTOTPKeyURI(
			options.issuer,
			user.name,
			Buffer.from(secret),
			opts,
		);
		const backupCodes = await generateBackupCodes(secret, options.backupCodes);
		return {
			uri,
			backupCodes: backupCodes.backupCodes,
		};
	}

	const disableTOTP = createAuthEndpoint(
		"/disable/totp",
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
			await ctx.context.adapter.update({
				model: "user",
				update: {
					twoFactorEnabled: false,
				},
				where: [
					{
						field: "id",
						value: user.id,
					},
				],
			});
			return ctx.json({ status: true });
		},
	);

	const generateTOTP = createAuthEndpoint(
		"/generate/totp",
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
			const session = ctx.context.session;
			const totp = new TOTPController(opts);
			const secret = (session.user as any).secret;
			const code = await totp.generate(secret);
			return { code };
		},
	);

	const getTOTPURI = createAuthEndpoint(
		"/get/totp/uri",
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
			return {
				totpURI: createTOTPKeyURI(
					options?.issuer || "BetterAuth",
					user.name,
					Buffer.from(user.twoFactorSecret),
					opts,
				),
			};
		},
	);

	const verifyTOTP = createAuthEndpoint(
		"/verify/totp",
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
			const secret = Buffer.from(
				symmetricDecrypt({
					key: ctx.context.secret,
					data: ctx.context.session.user.twoFactorSecret,
				}),
			);
			const status = await totp.verify(ctx.body.code, secret);
			return {
				status,
			};
		},
	);
	return {
		id: "totp",
		verify: verifyTOTP,
		customActions: {
			generateTOTP: generateTOTP,
			viewTOTPURI: getTOTPURI,
		},
	} satisfies TwoFactorProvider;
};
