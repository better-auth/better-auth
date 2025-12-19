import type { AuthContext } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import { BASE_ERROR_CODES } from "@better-auth/core/error";
import { APIError } from "better-call";
import * as z from "zod";
import { generateId } from "../../utils";
import { getDate } from "../../utils/date";
import { originCheck } from "../middlewares";

function redirectError(
	ctx: AuthContext,
	callbackURL: string | undefined,
	query?: Record<string, string> | undefined,
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
	query?: Record<string, string> | undefined,
): string {
	const url = new URL(callbackURL, ctx.baseURL);
	if (query)
		Object.entries(query).forEach(([k, v]) => url.searchParams.set(k, v));
	return url.href;
}

export const requestPasswordReset = createAuthEndpoint(
	"/request-password-reset",
	{
		method: "POST",
		body: z.object({
			/**
			 * The email address of the user to send a password reset email to.
			 */
			email: z.email().meta({
				description:
					"The email address of the user to send a password reset email to",
			}),
			/**
			 * The URL to redirect the user to reset their password.
			 * If the token isn't valid or expired, it'll be redirected with a query parameter `?
			 * error=INVALID_TOKEN`. If the token is valid, it'll be redirected with a query parameter `?
			 * token=VALID_TOKEN
			 */
			redirectTo: z
				.string()
				.meta({
					description:
						"The URL to redirect the user to reset their password. If the token isn't valid or expired, it'll be redirected with a query parameter `?error=INVALID_TOKEN`. If the token is valid, it'll be redirected with a query parameter `?token=VALID_TOKEN",
				})
				.optional(),
		}),
		metadata: {
			openapi: {
				operationId: "requestPasswordReset",
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
										message: {
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
			/**
			 * We simulate the verification token generation and the database lookup
			 * to mitigate timing attacks.
			 */
			generateId(24);
			await ctx.context.internalAdapter.findVerificationValue(
				"dummy-verification-token",
			);
			ctx.context.logger.error("Reset Password: User not found", { email });
			return ctx.json({
				status: true,
				message:
					"If this email exists in our system, check your email for the reset link",
			});
		}
		const defaultExpiresIn = 60 * 60 * 1;
		const expiresAt = getDate(
			ctx.context.options.emailAndPassword.resetPasswordTokenExpiresIn ||
				defaultExpiresIn,
			"sec",
		);
		const verificationToken = generateId(24);
		await ctx.context.internalAdapter.createVerificationValue({
			value: user.user.id,
			identifier: `reset-password:${verificationToken}`,
			expiresAt,
		});
		const callbackURL = redirectTo ? encodeURIComponent(redirectTo) : "";
		const url = `${ctx.context.baseURL}/reset-password/${verificationToken}?callbackURL=${callbackURL}`;
		await ctx.context.options.emailAndPassword
			.sendResetPassword(
				{
					user: user.user,
					url,
					token: verificationToken,
				},
				ctx.request,
			)
			.catch((e) => {
				ctx.context.logger.error("Failed to send reset password email", e);
			});
		return ctx.json({
			status: true,
			message:
				"If this email exists in our system, check your email for the reset link",
		});
	},
);

export const requestPasswordResetCallback = createAuthEndpoint(
	"/reset-password/:token",
	{
		method: "GET",
		operationId: "forgetPasswordCallback",
		query: z.object({
			callbackURL: z.string().meta({
				description: "The URL to redirect the user to reset their password",
			}),
		}),
		use: [originCheck((ctx) => ctx.query.callbackURL)],
		metadata: {
			openapi: {
				operationId: "resetPasswordCallback",
				description: "Redirects the user to the callback URL with the token",
				parameters: [
					{
						name: "token",
						in: "path",
						required: true,
						description: "The token to reset the password",
						schema: {
							type: "string",
						},
					},
					{
						name: "callbackURL",
						in: "query",
						required: true,
						description: "The URL to redirect the user to reset their password",
						schema: {
							type: "string",
						},
					},
				],
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
		operationId: "resetPassword",
		query: z
			.object({
				token: z.string().optional(),
			})
			.optional(),
		body: z.object({
			newPassword: z.string().meta({
				description: "The new password to set",
			}),
			token: z
				.string()
				.meta({
					description: "The token to reset the password",
				})
				.optional(),
		}),
		metadata: {
			openapi: {
				operationId: "resetPassword",
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
			await ctx.context.internalAdapter.createAccount({
				userId,
				providerId: "credential",
				password: hashedPassword,
				accountId: userId,
			});
		} else {
			await ctx.context.internalAdapter.updatePassword(userId, hashedPassword);
		}
		await ctx.context.internalAdapter.deleteVerificationValue(verification.id);

		if (ctx.context.options.emailAndPassword?.onPasswordReset) {
			const user = await ctx.context.internalAdapter.findUserById(userId);
			if (user) {
				await ctx.context.options.emailAndPassword.onPasswordReset(
					{
						user,
					},
					ctx.request,
				);
			}
		}
		if (ctx.context.options.emailAndPassword?.revokeSessionsOnPasswordReset) {
			await ctx.context.internalAdapter.deleteSessions(userId);
		}
		return ctx.json({
			status: true,
		});
	},
);
