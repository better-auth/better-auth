import { alphabet, generateRandomString } from "oslo/crypto";
import { z } from "zod";
import { createAuthEndpoint, createAuthMiddleware } from "../../api/call";
import { sessionMiddleware } from "../../api/middlewares/session";
import { hs256, symmetricEncrypt } from "../../crypto";
import type { BetterAuthPlugin } from "../../types/plugins";
import { backupCode2fa, generateBackupCodes } from "./backup-codes";
import { otp2fa } from "./otp";
import { totp2fa } from "./totp";

import type { TwoFactorOptions, UserWithTwoFactor } from "./types";
import type { Session } from "../../adapters/schema";

export const twoFactor = <O extends TwoFactorOptions>(options?: O) => {
	const totp = totp2fa({
		issuer: options?.issuer || "better-auth",
		...options?.totpOptions,
	});
	const backupCode = backupCode2fa(options?.backupCodeOptions);
	const otp = otp2fa(options?.otpOptions);
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
					const backupCodes = await generateBackupCodes(
						ctx.context.secret,
						options?.backupCodeOptions,
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
		hooks: {
			after: [
				{
					matcher(context) {
						return (
							context.path === "/sign-in/email" ||
							context.path === "/sign-in/username"
						);
					},
					handler: createAuthMiddleware(async (ctx) => {
						const returned = ctx.context.returned;
						if (returned?.status !== 200) {
							return;
						}
						const response = (await returned.clone().json()) as {
							user: UserWithTwoFactor;
							session: Session;
						};
						if (!response.user.twoFactorEnabled) {
							return;
						}
						/**
						 * remove the session cookie. It's set by the sign in credential
						 */
						ctx.setCookie(ctx.context.authCookies.sessionToken.name, "", {
							path: "/",
							sameSite: "lax",
							httpOnly: true,
							secure: false,
							maxAge: 0,
						});
						const hash = await hs256(ctx.context.secret, response.session.id);
						/**
						 * We set the user id and the session
						 * id as a hash. Later will fetch for
						 * sessions with the user id compare
						 * the hash and set that as session.
						 */
						await ctx.setSignedCookie(
							"better-auth.two-factor",
							`${response.session.userId}!${hash}`,
							ctx.context.secret,
							ctx.context.authCookies.sessionToken.options,
						);
						const res = new Response(
							JSON.stringify({
								twoFactorRedirect: true,
							}),
							{
								headers: ctx.responseHeader,
							},
						);
						return {
							response: res,
						};
					}),
				},
			],
		},
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
	} satisfies BetterAuthPlugin;
};

export * from "./client";
