import { z } from "zod";
import { createAuthEndpoint } from "../../api/call";
import { Plugin } from "../../types/plugins";
import { totp2fa } from "./totp";
import { TwoFactorOptions, UserWithTwoFactor } from "./types";
import {
	twoFactorMiddleware,
	verifyTwoFactorMiddleware,
} from "./two-fa-middleware";
import { sessionMiddleware } from "../../api/middlewares/session";
import { alphabet, generateRandomString } from "oslo/crypto";
import { backupCode2fa, generateBackupCodes } from "./backup-codes";
import { otp2fa } from "./otp";
import { symmetricEncrypt } from "../../crypto";

export const twoFactor = <O extends TwoFactorOptions>(options: O) => {
	const totp = totp2fa({
		issuer: options.issuer,
		...options.totpOptions,
	});
	const backupCode = backupCode2fa(options.backupCodeOptions);
	const otp = otp2fa(options.otpOptions);
	const providers = [totp, backupCode, otp];
	return {
		id: "two-factor",
		endpoints: {
			...totp.endpoints,
			...otp.endpoints,
			...backupCode.endpoints,
			enableTwoFactor: createAuthEndpoint(
				"/two-factor/enable",
				{
					method: "POST",
					use: [sessionMiddleware],
				},
				async (ctx) => {
					const user = ctx.context.session.user as UserWithTwoFactor;
					const secret = generateRandomString(16, alphabet("a-z", "0-9", "-"));
					const encryptedSecret = symmetricEncrypt({
						key: ctx.context.secret,
						data: secret,
					});
					console.log({ encryptedSecret });
					const backupCodes = await generateBackupCodes(
						ctx.context.secret,
						options.backupCodeOptions,
					);
					await ctx.context.adapter.update({
						model: "user",
						update: {
							twoFactorSecret: encryptedSecret,
							twoFactorEnabled: true,
							twoFactorBackupCodes: backupCodes.encryptedBackupCodes,
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
			),
			disableTwoFactor: createAuthEndpoint(
				"/two-factor/disable",
				{
					method: "POST",
					use: [sessionMiddleware],
				},
				async (ctx) => {
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
			),
		},
		options: options,
		middlewares: [
			{
				path: "/sign-in/credential",
				middleware: twoFactorMiddleware(options),
			},
		],
		schema: {
			user: {
				fields: {
					twoFactorEnabled: {
						type: "boolean",
						required: false,
						defaultValue: false,
					},
					twoFactorSecret: {
						type: "string",
						required: false,
					},
					twoFactorBackupCodes: {
						type: "string",
						required: false,
						returned: false,
					},
				},
			},
		},
	} satisfies Plugin;
};
