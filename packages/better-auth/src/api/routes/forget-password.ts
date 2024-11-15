import { z } from "zod";
import { createAuthEndpoint } from "../call";
import { APIError } from "better-call";
import type { AuthContext } from "../../init";
import { getDate } from "../../utils/date";

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
			email: z.string().email(),
			/**
			 * The URL to redirect the user to reset their password.
			 * If the token isn't valid or expired, it'll be redirected with a query parameter `?
			 * error=INVALID_TOKEN`. If the token is valid, it'll be redirected with a query parameter `?
			 * token=VALID_TOKEN
			 */
			redirectTo: z.string(),
		}),
	},
	async (ctx) => {
		if (!ctx.context.options.emailAndPassword?.sendResetPassword) {
			ctx.context.logger.error(
				"Reset password isn't enabled.Please pass an emailAndPassword.sendResetPasswordToken function in your auth config!",
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
			//only on the server status is false for the client it's always true
			//to avoid leaking information
			return ctx.json(
				{
					status: false,
				},
				{
					body: {
						status: true,
					},
				},
			);
		}
		const defaultExpiresIn = 60 * 60 * 1;
		const expiresAt = getDate(
			ctx.context.options.emailAndPassword.resetPasswordTokenExpiresIn ||
				defaultExpiresIn,
			"sec",
		);
		const verificationToken = ctx.context.uuid();
		await ctx.context.internalAdapter.createVerificationValue({
			value: user.user.id,
			identifier: `reset-password:${verificationToken}`,
			expiresAt,
		});
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
			callbackURL: z.string(),
		}),
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
		query: z.optional(
			z.object({
				token: z.string().optional(),
				currentURL: z.string().optional(),
			}),
		),
		method: "POST",
		body: z.object({
			newPassword: z.string(),
			token: z.string().optional(),
		}),
	},
	async (ctx) => {
		const token =
			ctx.body.token ||
			ctx.query?.token ||
			(ctx.query?.currentURL
				? new URL(ctx.query.currentURL).searchParams.get("token")
				: "");
		if (!token) {
			throw new APIError("BAD_REQUEST", {
				message: "Token not found",
			});
		}
		const { newPassword } = ctx.body;
		const id = `reset-password:${token}`;
		const verification =
			await ctx.context.internalAdapter.findVerificationValue(id);
		if (!verification || verification.expiresAt < new Date()) {
			throw new APIError("BAD_REQUEST", {
				message: "Invalid token",
			});
		}
		await ctx.context.internalAdapter.deleteVerificationValue(verification.id);
		const userId = verification.value;
		const hashedPassword = await ctx.context.password.hash(newPassword);
		const accounts = await ctx.context.internalAdapter.findAccounts(userId);
		const account = accounts.find((ac) => ac.providerId === "credential");
		if (!account) {
			await ctx.context.internalAdapter.createAccount({
				userId,
				providerId: "credential",
				password: hashedPassword,
				accountId: ctx.context.uuid(),
			});
			return ctx.json({
				status: true,
			});
		}
		const updatedUser = await ctx.context.internalAdapter.updatePassword(
			userId,
			hashedPassword,
		);
		if (!updatedUser) {
			throw new APIError("BAD_REQUEST", {
				message: "Failed to update password",
			});
		}
		return ctx.json({
			status: true,
		});
	},
);
