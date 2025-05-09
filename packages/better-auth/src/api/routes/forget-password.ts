import { z } from "zod";
import { createAuthEndpoint } from "../call";
import { APIError } from "better-call";
import type { AuthContext } from "../../init";
import { getDate } from "../../utils/date";
import { generateId } from "../../utils";
import { BASE_ERROR_CODES } from "../../error/codes";
import { originCheck } from "../middlewares";

function redirectError(
	ctx: AuthContext,
	callbackURL: string | undefined,
	query?: Record<string, string>,
): string {
	const url = callbackURL
		? new URL(callbackURL, ctx.baseURL)
		: new URL(`${ctx.baseURL}/error`);
	if (query)
		Object.entries(query).forEach(([k, v]) => url.searchParams.set(k, v));
	return url.href;
}

function redirectCallback(
	ctx: AuthContext,
	callbackURL: string,
	query?: Record<string, string>,
): string {
	const url = new URL(callbackURL, ctx.baseURL);
	if (query)
		Object.entries(query).forEach(([k, v]) => url.searchParams.set(k, v));
	return url.href;
}

export const forgetPassword = createAuthEndpoint(
	"/forget-password",
	{
		method: "POST",
		body: z.object({
			/**
			 * The email address of the user to send a password reset email to.
			 */
			email: z
				.string({
					description:
						"The email address of the user to send a password reset email to",
				})
				.email(),
			/**
			 * The URL to redirect the user to reset their password.
			 * If the token isn't valid or expired, it'll be redirected with a query parameter `?
			 * error=INVALID_TOKEN`. If the token is valid, it'll be redirected with a query parameter `?
			 * token=VALID_TOKEN
			 */
			redirectTo: z
				.string({
					description:
						"The URL to redirect the user to reset their password. If the token isn't valid or expired, it'll be redirected with a query parameter `?error=INVALID_TOKEN`. If the token is valid, it'll be redirected with a query parameter `?token=VALID_TOKEN",
				})
				.optional(),
		}),
		metadata: {
			openapi: {
				description: "Send a password reset email to the user",
				responses: {
					"200": {
						description: "Success",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										status: {
											type: "boolean",
										},
									},
								},
							},
						},
					},
				},
			},
		},
	},
	async (ctx) => {
		if (!ctx.context.options.emailAndPassword?.sendResetPassword) {
			ctx.context.logger.error(
				"Reset password isn't enabled.Please pass an emailAndPassword.sendResetPassword function in your auth config!",
			);
			throw new APIError("BAD_REQUEST", {
				message: "Reset password isn't enabled",
			});
		}
		const { email, redirectTo } = ctx.body;

		const user = await ctx.context.internalAdapter.findUserByEmail(email, {
			includeAccounts: true,
		});
		if (!user) {
			ctx.context.logger.error("Reset Password: User not found", { email });
			return ctx.json({
				status: true,
			});
		}
		const defaultExpiresIn = 60 * 60 * 1;
		const expiresAt = getDate(
			ctx.context.options.emailAndPassword.resetPasswordTokenExpiresIn ||
				defaultExpiresIn,
			"sec",
		);
		const verificationToken = generateId(24);
		await ctx.context.internalAdapter.createVerificationValue(
			{
				value: user.user.id,
				identifier: `reset-password:${verificationToken}`,
				expiresAt,
			},
			ctx,
		);
		const url = `${ctx.context.baseURL}/reset-password/${verificationToken}?callbackURL=${redirectTo}`;
		await ctx.context.options.emailAndPassword.sendResetPassword(
			{
				user: user.user,
				url,
				token: verificationToken,
			},
			ctx.request,
		);
		return ctx.json({
			status: true,
		});
	},
);

export const forgetPasswordCallback = createAuthEndpoint(
	"/reset-password/:token",
	{
		method: "GET",
		query: z.object({
			callbackURL: z.string({
				description: "The URL to redirect the user to reset their password",
			}),
		}),
		use: [originCheck((ctx) => ctx.query.callbackURL)],
		metadata: {
			openapi: {
				description: "Redirects the user to the callback URL with the token",
				responses: {
					"200": {
						description: "Success",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										token: {
											type: "string",
										},
									},
								},
							},
						},
					},
				},
			},
		},
	},
	async (ctx) => {
		const { token } = ctx.params;
		const { callbackURL } = ctx.query;
		if (!token || !callbackURL) {
			throw ctx.redirect(
				redirectError(ctx.context, callbackURL, { error: "INVALID_TOKEN" }),
			);
		}
		const verification =
			await ctx.context.internalAdapter.findVerificationValue(
				`reset-password:${token}`,
			);
		if (!verification || verification.expiresAt < new Date()) {
			throw ctx.redirect(
				redirectError(ctx.context, callbackURL, { error: "INVALID_TOKEN" }),
			);
		}

		throw ctx.redirect(redirectCallback(ctx.context, callbackURL, { token }));
	},
);

export const resetPassword = createAuthEndpoint(
	"/reset-password",
	{
		method: "POST",
		query: z
			.object({
				token: z.string().optional(),
			})
			.optional(),
		body: z.object({
			newPassword: z.string({
				description: "The new password to set",
			}),
			token: z
				.string({
					description: "The token to reset the password",
				})
				.optional(),
		}),
		metadata: {
			openapi: {
				description: "Reset the password for a user",
				responses: {
					"200": {
						description: "Success",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										status: {
											type: "boolean",
										},
									},
								},
							},
						},
					},
				},
			},
		},
	},
	async (ctx) => {
		const token = ctx.body.token || ctx.query?.token;
		if (!token) {
			throw new APIError("BAD_REQUEST", {
				message: BASE_ERROR_CODES.INVALID_TOKEN,
			});
		}

		const { newPassword } = ctx.body;

		const minLength = ctx.context.password?.config.minPasswordLength;
		const maxLength = ctx.context.password?.config.maxPasswordLength;
		if (newPassword.length < minLength) {
			throw new APIError("BAD_REQUEST", {
				message: BASE_ERROR_CODES.PASSWORD_TOO_SHORT,
			});
		}
		if (newPassword.length > maxLength) {
			throw new APIError("BAD_REQUEST", {
				message: BASE_ERROR_CODES.PASSWORD_TOO_LONG,
			});
		}

		const id = `reset-password:${token}`;

		const verification =
			await ctx.context.internalAdapter.findVerificationValue(id);
		if (!verification || verification.expiresAt < new Date()) {
			throw new APIError("BAD_REQUEST", {
				message: BASE_ERROR_CODES.INVALID_TOKEN,
			});
		}
		const userId = verification.value;
		const hashedPassword = await ctx.context.password.hash(newPassword);
		const accounts = await ctx.context.internalAdapter.findAccounts(userId);
		const account = accounts.find((ac) => ac.providerId === "credential");
		if (!account) {
			await ctx.context.internalAdapter.createAccount(
				{
					userId,
					providerId: "credential",
					password: hashedPassword,
					accountId: userId,
				},
				ctx,
			);
			await ctx.context.internalAdapter.deleteVerificationValue(
				verification.id,
			);

			return ctx.json({
				status: true,
			});
		}
		await ctx.context.internalAdapter.updatePassword(
			userId,
			hashedPassword,
			ctx,
		);
		await ctx.context.internalAdapter.deleteVerificationValue(verification.id);
		if (ctx.context.options.emailAndPassword?.revokeSessionsOnPasswordReset) {
			await ctx.context.internalAdapter.deleteSessions(userId);
		}
		return ctx.json({
			status: true,
		});
	},
);
