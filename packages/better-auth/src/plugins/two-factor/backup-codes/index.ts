import { alphabet, generateRandomString } from "../../../crypto/random";
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
		.map(() =>
			generateRandomString(options?.length ?? 10, alphabet("a-z", "0-9")),
		)
		.map((code) => `${code.slice(0, 5)}-${code.slice(5)}`);
}

export async function generateBackupCodes(
	secret: string,
	options?: BackupCodeOptions,
) {
	const key = secret;
	const backupCodes = options?.customBackupCodesGenerate
		? options.customBackupCodesGenerate()
		: generateBackupCodesFn();
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
		return false;
	}
	return codes.includes(data.code);
}

export async function getBackupCodes(backupCodes: string, key: string) {
	const secret = Buffer.from(
		await symmetricDecrypt({ key, data: backupCodes }),
	).toString("utf-8");
	const data = JSON.parse(secret);
	const result = z.array(z.string()).safeParse(data);
	if (result.success) {
		return result.data;
	}
	return null;
}

export const backupCode2fa = (
	options: BackupCodeOptions,
	twoFactorTable: string,
) => {
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
						disableSession: z.boolean().optional(),
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
							message: "Backup codes aren't enabled",
						});
					}
					const validate = verifyBackupCode(
						{
							backupCodes: twoFactor.backupCodes,
							code: ctx.body.code,
						},
						ctx.context.secret,
					);
					if (!validate) {
						throw new APIError("BAD_REQUEST", {
							message: "Invalid backup code",
						});
					}
					if (!ctx.body.disableSession) {
						await setSessionCookie(ctx, ctx.context.session.id);
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
					use: [sessionMiddleware],
				},
				async (ctx) => {
					const user = ctx.context.session.user as UserWithTwoFactor;
					if (!user.twoFactorEnabled) {
						throw new APIError("BAD_REQUEST", {
							message: "Two factor isn't enabled",
						});
					}
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
				"/view/backup-codes",
				{
					method: "GET",
					use: [sessionMiddleware],
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
							message: "Backup codes aren't enabled",
						});
					}
					const backupCodes = getBackupCodes(
						twoFactor.backupCodes,
						ctx.context.secret,
					);
					if (!backupCodes) {
						throw new APIError("BAD_REQUEST", {
							message: "Backup codes aren't enabled",
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
