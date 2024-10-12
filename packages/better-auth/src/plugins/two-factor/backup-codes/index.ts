import { alphabet, generateRandomString } from "../../../crypto/random";
import { z } from "zod";
import { createAuthEndpoint } from "../../../api/call";
import { sessionMiddleware } from "../../../api";
import { symmetricDecrypt, symmetricEncrypt } from "../../../crypto";
import { verifyTwoFactorMiddleware } from "../verify-middleware";
import type { TwoFactorProvider, UserWithTwoFactor } from "../types";
import { APIError } from "better-call";

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
		user: UserWithTwoFactor;
		code: string;
	},
	key: string,
) {
	const codes = await getBackupCodes(data.user, key);
	if (!codes) {
		return false;
	}
	return codes.includes(data.code);
}

export async function getBackupCodes(user: UserWithTwoFactor, key: string) {
	const secret = Buffer.from(
		await symmetricDecrypt({ key, data: user.twoFactorBackupCodes }),
	).toString("utf-8");
	const data = JSON.parse(secret);
	const result = z.array(z.string()).safeParse(data);
	if (result.success) {
		return result.data;
	}
	return null;
}

export const backupCode2fa = (options?: BackupCodeOptions) => {
	return {
		id: "backup_code",
		endpoints: {
			verifyBackupCode: createAuthEndpoint(
				"/two-factor/verify-backup-code",

				{
					method: "POST",
					body: z.object({
						code: z.string(),
					}),
					use: [verifyTwoFactorMiddleware],
				},
				async (ctx) => {
					const validate = verifyBackupCode(
						{
							user: ctx.context.session.user,
							code: ctx.body.code,
						},
						ctx.context.secret,
					);
					if (!validate) {
						throw new APIError("BAD_REQUEST", {
							message: "Invalid backup code",
						});
					}
					return ctx.json({ status: true });
				},
			),
			generateBackupCodes: createAuthEndpoint(
				"/two-factor/generate-backup-codes",
				{
					method: "POST",
					use: [sessionMiddleware],
				},
				async (ctx) => {
					const backupCodes = await generateBackupCodes(
						ctx.context.secret,
						options,
					);
					await ctx.context.adapter.update({
						model: "user",
						update: {
							twoFactorEnabled: true,
							twoFactorBackupCodes: backupCodes.encryptedBackupCodes,
						},
						where: [
							{
								field: "id",
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
					const backupCodes = getBackupCodes(user, ctx.context.secret);
					return ctx.json({
						status: true,
						backupCodes: backupCodes,
					});
				},
			),
		},
	} satisfies TwoFactorProvider;
};
