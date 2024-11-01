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
import { createTOTPKeyURI } from "oslo/otp";
import { TimeSpan } from "oslo";
import { deleteSessionCookie, setSessionCookie } from "../../cookies";

export const twoFactor = (options?: TwoFactorOptions) => {
	const opts = {
		twoFactorTable: options?.twoFactorTable || ("twoFactor" as const),
	};
	const totp = totp2fa(
		{
			issuer: options?.issuer || "better-auth",
			...options?.totpOptions,
		},
		opts.twoFactorTable,
	);
	const backupCode = backupCode2fa(
		{
			...options?.backupCodeOptions,
		},
		opts.twoFactorTable,
	);
	const otp = otp2fa(
		{
			...options?.otpOptions,
		},
		opts.twoFactorTable,
	);
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
					if (options?.skipVerificationOnEnable) {
						const updatedUser = await ctx.context.internalAdapter.updateUser(
							user.id,
							{
								twoFactorEnabled: true,
							},
						);
						const newSession = await ctx.context.internalAdapter.createSession(
							updatedUser.id,
						);
						/**
						 * Update the session cookie with the new user data
						 */
						await setSessionCookie(ctx, {
							session: newSession,
							user,
						});
					}
					//delete existing two factor
					await ctx.context.adapter.deleteMany({
						model: opts.twoFactorTable,
						where: [
							{
								field: "userId",
								value: user.id,
							},
						],
					});

					await ctx.context.adapter.create({
						model: opts.twoFactorTable,
						data: {
							id: ctx.context.uuid(),
							secret: encryptedSecret,
							backupCodes: backupCodes.encryptedBackupCodes,
							userId: user.id,
						},
					});
					const totpURI = createTOTPKeyURI(
						options?.issuer || "BetterAuth",
						user.email,
						Buffer.from(secret),
						{
							digits: options?.totpOptions?.digits || 6,
							period: new TimeSpan(options?.totpOptions?.period || 30, "s"),
						},
					);
					return ctx.json({ totpURI, backupCodes: backupCodes.backupCodes });
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
					await ctx.context.internalAdapter.updateUser(user.id, {
						twoFactorEnabled: false,
					});
					await ctx.context.adapter.delete({
						model: opts.twoFactorTable,
						where: [
							{
								field: "userId",
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
									trustDeviceCookieName.attributes,
								);
								return;
							}
						}

						/**
						 * remove the session cookie. It's set by the sign in credential
						 */
						deleteSessionCookie(ctx);
						const hash = await hs256(ctx.context.secret, response.session.id);
						const twoFactorCookie = ctx.context.createAuthCookie(
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
							twoFactorCookie.name,
							`${response.session.userId}!${hash}`,
							ctx.context.secret,
							twoFactorCookie.attributes,
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
						input: false,
					},
				},
			},
			twoFactor: {
				tableName: opts.twoFactorTable,
				fields: {
					secret: {
						type: "string",
						required: true,
						returned: false,
					},
					backupCodes: {
						type: "string",
						required: true,
						returned: false,
					},
					userId: {
						type: "string",
						required: true,
						returned: false,
						references: {
							model: "user",
							field: "id",
						},
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
