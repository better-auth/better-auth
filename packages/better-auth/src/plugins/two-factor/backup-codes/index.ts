import { generateRandomString } from "../../../crypto/random";
import { z } from "zod";
import { createAuthEndpoint } from "../../../api/call";
import { sessionMiddleware } from "../../../api";
import { symmetricDecrypt, symmetricEncrypt } from "../../../crypto";
import { verifyTwoFactorMiddleware } from "../verify-middleware";
import type {
	TwoFactorProvider,
	TwoFactorTable,
	UserWithTwoFactor,
} from "../types";
import { APIError } from "better-call";
import { setSessionCookie } from "../../../cookies";
import { TWO_FACTOR_ERROR_CODES } from "../error-code";

export interface BackupCodeOptions {
	/**
	 * The amount of backup codes to generate
	 *
	 * @default 10
	 */
	amount?: number;
	/**
	 * The length of the backup codes
	 *
	 * @default 10
	 */
	length?: number;
	customBackupCodesGenerate?: () => string[];
}

function generateBackupCodesFn(options?: BackupCodeOptions) {
	return Array.from({ length: options?.amount ?? 10 })
		.fill(null)
		.map(() => generateRandomString(options?.length ?? 10, "a-z", "0-9", "A-Z"))
		.map((code) => `${code.slice(0, 5)}-${code.slice(5)}`);
}

export async function generateBackupCodes(
	secret: string,
	options?: BackupCodeOptions,
) {
	const key = secret;
	const backupCodes = options?.customBackupCodesGenerate
		? options.customBackupCodesGenerate()
		: generateBackupCodesFn(options);
	const encCodes = await symmetricEncrypt({
		data: JSON.stringify(backupCodes),
		key: key,
	});
	return {
		backupCodes,
		encryptedBackupCodes: encCodes,
	};
}

export async function verifyBackupCode(
	data: {
		backupCodes: string;
		code: string;
	},
	key: string,
) {
	const codes = await getBackupCodes(data.backupCodes, key);
	if (!codes) {
		return {
			status: false,
			updated: null,
		};
	}
	return {
		status: codes.includes(data.code),
		updated: codes.filter((code) => code !== data.code),
	};
}

export async function getBackupCodes(backupCodes: string, key: string) {
	const secret = new TextDecoder("utf-8").decode(
		new TextEncoder().encode(
			await symmetricDecrypt({ key, data: backupCodes }),
		),
	);
	const data = JSON.parse(secret);
	const result = z.array(z.string()).safeParse(data);
	if (result.success) {
		return result.data;
	}
	return null;
}

export const backupCode2fa = (options?: BackupCodeOptions) => {
	const twoFactorTable = "twoFactor";
	return {
		id: "backup_code",
		endpoints: {
			verifyBackupCode: createAuthEndpoint(
				"/two-factor/verify-backup-code",

				{
					method: "POST",
					body: z.object({
						code: z.string(),
						/**
						 * Disable setting the session cookie
						 */
						disableSession: z
							.boolean({
								description: "If true, the session cookie will not be set.",
							})
							.optional(),
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
					use: [verifyTwoFactorMiddleware],
				},
				async (ctx) => {
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
							message: TWO_FACTOR_ERROR_CODES.BACKUP_CODES_NOT_ENABLED,
						});
					}
					const validate = await verifyBackupCode(
						{
							backupCodes: twoFactor.backupCodes,
							code: ctx.body.code,
						},
						ctx.context.secret,
					);
					if (!validate.status) {
						throw new APIError("UNAUTHORIZED", {
							message: TWO_FACTOR_ERROR_CODES.INVALID_BACKUP_CODE,
						});
					}
					const updatedBackupCodes = await symmetricEncrypt({
						key: ctx.context.secret,
						data: JSON.stringify(validate.updated),
					});

					await ctx.context.adapter.updateMany({
						model: twoFactorTable,
						update: {
							backupCodes: updatedBackupCodes,
						},
						where: [
							{
								field: "userId",
								value: user.id,
							},
						],
					});

					if (!ctx.body.disableSession) {
						await setSessionCookie(ctx, {
							session: ctx.context.session.session,
							user,
						});
					}
					return ctx.json({
						user: user,
						session: ctx.context.session,
					});
				},
			),
			generateBackupCodes: createAuthEndpoint(
				"/two-factor/generate-backup-codes",
				{
					method: "POST",
					body: z.object({
						password: z.string(),
					}),
					use: [sessionMiddleware],
				},
				async (ctx) => {
					const user = ctx.context.session.user as UserWithTwoFactor;
					if (!user.twoFactorEnabled) {
						throw new APIError("BAD_REQUEST", {
							message: TWO_FACTOR_ERROR_CODES.TWO_FACTOR_NOT_ENABLED,
						});
					}
					await ctx.context.password.checkPassword(user.id, ctx);
					const backupCodes = await generateBackupCodes(
						ctx.context.secret,
						options,
					);
					await ctx.context.adapter.update({
						model: twoFactorTable,
						update: {
							backupCodes: backupCodes.encryptedBackupCodes,
						},
						where: [
							{
								field: "userId",
								value: ctx.context.session.user.id,
							},
						],
					});
					return ctx.json({
						status: true,
						backupCodes: backupCodes.backupCodes,
					});
				},
			),
			viewBackupCodes: createAuthEndpoint(
				"/two-factor/view-backup-codes",
				{
					method: "GET",
					body: z.object({
						userId: z.coerce.string(),
					}),
					metadata: {
						SERVER_ONLY: true,
					},
				},
				async (ctx) => {
					const twoFactor = await ctx.context.adapter.findOne<TwoFactorTable>({
						model: twoFactorTable,
						where: [
							{
								field: "userId",
								value: ctx.body.userId,
							},
						],
					});
					if (!twoFactor) {
						throw new APIError("BAD_REQUEST", {
							message: "Backup codes aren't enabled",
						});
					}
					const backupCodes = await getBackupCodes(
						twoFactor.backupCodes,
						ctx.context.secret,
					);
					if (!backupCodes) {
						throw new APIError("BAD_REQUEST", {
							message: TWO_FACTOR_ERROR_CODES.BACKUP_CODES_NOT_ENABLED,
						});
					}
					return ctx.json({
						status: true,
						backupCodes: backupCodes,
					});
				},
			),
		},
	} satisfies TwoFactorProvider;
};
