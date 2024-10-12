import { alphabet, generateRandomString } from "../../crypto/random";
import { z } from "zod";
import { createAuthEndpoint, createAuthMiddleware } from "../../api/call";
import { sessionMiddleware } from "../../api";
import { hs256, symmetricEncrypt } from "../../crypto";
import type { BetterAuthPlugin } from "../../types/plugins";
import { backupCode2fa, generateBackupCodes } from "./backup-codes";
import { otp2fa } from "./otp";
import { totp2fa } from "./totp";
import type { TwoFactorOptions, UserWithTwoFactor } from "./types";
import type { Session } from "../../db/schema";
import { TWO_FACTOR_COOKIE_NAME, TRUST_DEVICE_COOKIE_NAME } from "./constant";
import { validatePassword } from "../../utils/password";
import { APIError } from "better-call";

export const twoFactor = (options?: TwoFactorOptions) => {
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
					body: z.object({
						password: z.string().min(8),
					}),
					use: [sessionMiddleware],
				},
				async (ctx) => {
					const user = ctx.context.session.user as UserWithTwoFactor;
					const { password } = ctx.body;
					const isPasswordValid = await validatePassword(ctx, {
						password,
						userId: user.id,
					});
					if (!isPasswordValid) {
						throw new APIError("BAD_REQUEST", {
							message: "Invalid password",
						});
					}
					const secret = generateRandomString(16, alphabet("a-z", "0-9", "-"));
					const encryptedSecret = await symmetricEncrypt({
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
					body: z.object({
						password: z.string().min(8),
					}),
					use: [sessionMiddleware],
				},
				async (ctx) => {
					const user = ctx.context.session.user as UserWithTwoFactor;
					const { password } = ctx.body;
					const isPasswordValid = await validatePassword(ctx, {
						password,
						userId: user.id,
					});
					if (!isPasswordValid) {
						throw new APIError("BAD_REQUEST", {
							message: "Invalid password",
						});
					}
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

						// Check for trust device cookie
						const trustDeviceCookieName = ctx.context.createAuthCookie(
							TRUST_DEVICE_COOKIE_NAME,
							{
								maxAge: 30 * 24 * 60 * 60, // 30 days
							},
						);
						const trustDeviceCookie = await ctx.getSignedCookie(
							trustDeviceCookieName.name,
							ctx.context.secret,
						);

						if (trustDeviceCookie) {
							const [token, sessionId] = trustDeviceCookie.split("!");
							const expectedToken = await hs256(
								ctx.context.secret,
								`${response.user.id}!${sessionId}`,
							);

							if (token === expectedToken) {
								// Trust device cookie is valid, refresh it and skip 2FA
								const newToken = await hs256(
									ctx.context.secret,
									`${response.user.id}!${response.session.id}`,
								);
								await ctx.setSignedCookie(
									trustDeviceCookieName.name,
									`${newToken}!${response.session.id}`,
									ctx.context.secret,
									trustDeviceCookieName.options,
								);
								return;
							}
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
						const cookieName = ctx.context.createAuthCookie(
							TWO_FACTOR_COOKIE_NAME,
							{
								maxAge: 60 * 60 * 24, // 24 hours,
							},
						);
						/**
						 * We set the user id and the session
						 * id as a hash. Later will fetch for
						 * sessions with the user id compare
						 * the hash and set that as session.
						 */
						await ctx.setSignedCookie(
							cookieName.name,
							`${response.session.userId}!${hash}`,
							ctx.context.secret,
							cookieName.options,
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
						returned: false,
					},
					twoFactorBackupCodes: {
						type: "string",
						required: false,
						returned: false,
					},
				},
			},
		},
		rateLimit: [
			{
				pathMatcher(path) {
					return path.startsWith("/two-factor/");
				},
				window: 10,
				max: 3,
			},
		],
	} satisfies BetterAuthPlugin;
};

export * from "./client";
