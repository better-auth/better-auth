import { implEndpoint } from "../../better-call/server";
import { APIError } from "better-call";
import type { AuthContext } from "../../init";
import { getDate } from "../../utils/date";
import { generateId } from "../../utils";
import { BASE_ERROR_CODES } from "../../error/codes";
import { originCheck } from "../middlewares";
import {
	requestPasswordResetDef,
	forgetPasswordDef,
	requestPasswordResetCallbackDef,
	resetPasswordDef,
} from "./shared";

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

export const requestPasswordReset = () =>
	implEndpoint(requestPasswordResetDef, async (ctx) => {
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
		await ctx.context.internalAdapter.createVerificationValue(
			{
				value: user.user.id,
				identifier: `reset-password:${verificationToken}`,
				expiresAt,
			},
			ctx,
		);
		const callbackURL = redirectTo ? encodeURIComponent(redirectTo) : "";
		const url = `${ctx.context.baseURL}/reset-password/${verificationToken}?callbackURL=${callbackURL}`;
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
	});

/**
 * @deprecated Use requestPasswordReset instead. This endpoint will be removed in the next major
 * version.
 */
export const forgetPassword = () =>
	implEndpoint(forgetPasswordDef, async (ctx) => {
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
		await ctx.context.internalAdapter.createVerificationValue(
			{
				value: user.user.id,
				identifier: `reset-password:${verificationToken}`,
				expiresAt,
			},
			ctx,
		);
		const callbackURL = redirectTo ? encodeURIComponent(redirectTo) : "";
		const url = `${ctx.context.baseURL}/reset-password/${verificationToken}?callbackURL=${callbackURL}`;
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
	});

export const requestPasswordResetCallback = () =>
	implEndpoint(
		requestPasswordResetCallbackDef,
		[originCheck((ctx) => ctx.query.callbackURL)],
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

/**
 * @deprecated Use requestPasswordResetCallback instead
 */
export const forgetPasswordCallback = requestPasswordResetCallback;

export const resetPassword = () =>
	implEndpoint(resetPasswordDef, async (ctx) => {
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
		} else {
			await ctx.context.internalAdapter.updatePassword(
				userId,
				hashedPassword,
				ctx,
			);
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
	});
