import { implEndpoint } from "../../better-call/server";

import { deleteSessionCookie, setSessionCookie } from "../../cookies";
import {
	getSessionFromCtx,
	sensitiveSessionMiddleware,
	sessionMiddleware,
} from "./session";
import { APIError } from "better-call";
import { createEmailVerificationToken } from "./email-verification";
import type { BetterAuthOptions } from "../../types";
import { parseUserInput } from "../../db/schema";
import { generateRandomString } from "../../crypto";
import { BASE_ERROR_CODES } from "../../error/codes";
import { originCheck } from "../middlewares";
import {
	updateUserDef,
	changePasswordDef,
	setPasswordDef,
	deleteUserDef,
	deleteUserCallbackDef,
	changeEmailDef,
} from "./shared";

export const updateUser = <O extends BetterAuthOptions>() =>
	implEndpoint(updateUserDef, [sessionMiddleware], async (ctx) => {
		const body = ctx.body as {
			name?: string;
			image?: string;
			[key: string]: any;
		};

		if (body.email) {
			throw new APIError("BAD_REQUEST", {
				message: BASE_ERROR_CODES.EMAIL_CAN_NOT_BE_UPDATED,
			});
		}
		const { name, image, ...rest } = body;
		const session = ctx.context.session;
		if (
			image === undefined &&
			name === undefined &&
			Object.keys(rest).length === 0
		) {
			return ctx.json({
				status: true,
			});
		}
		const additionalFields = parseUserInput(
			ctx.context.options,
			rest,
			"update",
		);
		const user = await ctx.context.internalAdapter.updateUser(
			session.user.id,
			{
				name,
				image,
				...additionalFields,
			},
			ctx,
		);
		/**
		 * Update the session cookie with the new user data
		 */
		await setSessionCookie(ctx, {
			session: session.session,
			user,
		});
		return ctx.json({
			status: true,
		});
	});

export const changePassword = () =>
	implEndpoint(changePasswordDef, [sensitiveSessionMiddleware], async (ctx) => {
		const { newPassword, currentPassword, revokeOtherSessions } = ctx.body;
		const session = ctx.context.session;
		const minPasswordLength = ctx.context.password.config.minPasswordLength;
		if (newPassword.length < minPasswordLength) {
			ctx.context.logger.error("Password is too short");
			throw new APIError("BAD_REQUEST", {
				message: BASE_ERROR_CODES.PASSWORD_TOO_SHORT,
			});
		}

		const maxPasswordLength = ctx.context.password.config.maxPasswordLength;

		if (newPassword.length > maxPasswordLength) {
			ctx.context.logger.error("Password is too long");
			throw new APIError("BAD_REQUEST", {
				message: BASE_ERROR_CODES.PASSWORD_TOO_LONG,
			});
		}

		const accounts = await ctx.context.internalAdapter.findAccounts(
			session.user.id,
		);
		const account = accounts.find(
			(account) => account.providerId === "credential" && account.password,
		);
		if (!account || !account.password) {
			throw new APIError("BAD_REQUEST", {
				message: BASE_ERROR_CODES.CREDENTIAL_ACCOUNT_NOT_FOUND,
			});
		}
		const passwordHash = await ctx.context.password.hash(newPassword);
		const verify = await ctx.context.password.verify({
			hash: account.password,
			password: currentPassword,
		});
		if (!verify) {
			throw new APIError("BAD_REQUEST", {
				message: BASE_ERROR_CODES.INVALID_PASSWORD,
			});
		}
		await ctx.context.internalAdapter.updateAccount(account.id, {
			password: passwordHash,
		});
		let token = null;
		if (revokeOtherSessions) {
			await ctx.context.internalAdapter.deleteSessions(session.user.id);
			const newSession = await ctx.context.internalAdapter.createSession(
				session.user.id,
				ctx,
			);
			if (!newSession) {
				throw new APIError("INTERNAL_SERVER_ERROR", {
					message: BASE_ERROR_CODES.FAILED_TO_GET_SESSION,
				});
			}
			// set the new session cookie
			await setSessionCookie(ctx, {
				session: newSession,
				user: session.user,
			});
			token = newSession.token;
		}

		return ctx.json({
			token,
			user: {
				id: session.user.id,
				email: session.user.email,
				name: session.user.name,
				image: session.user.image,
				emailVerified: session.user.emailVerified,
				createdAt: session.user.createdAt,
				updatedAt: session.user.updatedAt,
			},
		});
	});

export const setPassword = () =>
	implEndpoint(setPasswordDef, [sensitiveSessionMiddleware], async (ctx) => {
		const { newPassword } = ctx.body;
		const session = ctx.context.session;
		const minPasswordLength = ctx.context.password.config.minPasswordLength;
		if (newPassword.length < minPasswordLength) {
			ctx.context.logger.error("Password is too short");
			throw new APIError("BAD_REQUEST", {
				message: BASE_ERROR_CODES.PASSWORD_TOO_SHORT,
			});
		}

		const maxPasswordLength = ctx.context.password.config.maxPasswordLength;

		if (newPassword.length > maxPasswordLength) {
			ctx.context.logger.error("Password is too long");
			throw new APIError("BAD_REQUEST", {
				message: BASE_ERROR_CODES.PASSWORD_TOO_LONG,
			});
		}

		const accounts = await ctx.context.internalAdapter.findAccounts(
			session.user.id,
		);
		const account = accounts.find(
			(account) => account.providerId === "credential" && account.password,
		);
		const passwordHash = await ctx.context.password.hash(newPassword);
		if (!account) {
			await ctx.context.internalAdapter.linkAccount(
				{
					userId: session.user.id,
					providerId: "credential",
					accountId: session.user.id,
					password: passwordHash,
				},
				ctx,
			);
			return ctx.json({
				status: true,
			});
		}
		throw new APIError("BAD_REQUEST", {
			message: "user already has a password",
		});
	});

export const deleteUser = () =>
	implEndpoint(deleteUserDef, [sensitiveSessionMiddleware], async (ctx) => {
		if (!ctx.context.options.user?.deleteUser?.enabled) {
			ctx.context.logger.error(
				"Delete user is disabled. Enable it in the options",
				{
					session: ctx.context.session,
				},
			);
			throw new APIError("NOT_FOUND");
		}
		const session = ctx.context.session;

		if (ctx.body.password) {
			const accounts = await ctx.context.internalAdapter.findAccounts(
				session.user.id,
			);
			const account = accounts.find(
				(account) => account.providerId === "credential" && account.password,
			);
			if (!account || !account.password) {
				throw new APIError("BAD_REQUEST", {
					message: BASE_ERROR_CODES.CREDENTIAL_ACCOUNT_NOT_FOUND,
				});
			}
			const verify = await ctx.context.password.verify({
				hash: account.password,
				password: ctx.body.password,
			});
			if (!verify) {
				throw new APIError("BAD_REQUEST", {
					message: BASE_ERROR_CODES.INVALID_PASSWORD,
				});
			}
		}

		if (ctx.body.token) {
			//@ts-expect-error
			await deleteUserCallback({
				...ctx,
				query: {
					token: ctx.body.token,
				},
			});
			return ctx.json({
				success: true,
				message: "User deleted",
			});
		}

		if (ctx.context.options.user.deleteUser?.sendDeleteAccountVerification) {
			const token = generateRandomString(32, "0-9", "a-z");
			await ctx.context.internalAdapter.createVerificationValue(
				{
					value: session.user.id,
					identifier: `delete-account-${token}`,
					expiresAt: new Date(
						Date.now() +
							(ctx.context.options.user.deleteUser?.deleteTokenExpiresIn ||
								60 * 60 * 24) *
								1000,
					),
				},
				ctx,
			);
			const url = `${
				ctx.context.baseURL
			}/delete-user/callback?token=${token}&callbackURL=${
				ctx.body.callbackURL || "/"
			}`;
			await ctx.context.options.user.deleteUser.sendDeleteAccountVerification(
				{
					user: session.user,
					url,
					token,
				},
				ctx.request,
			);
			return ctx.json({
				success: true,
				message: "Verification email sent",
			});
		}

		if (!ctx.body.password && ctx.context.sessionConfig.freshAge !== 0) {
			const currentAge = new Date(session.session.createdAt).getTime();
			const freshAge = ctx.context.sessionConfig.freshAge * 1000;
			const now = Date.now();
			if (now - currentAge > freshAge * 1000) {
				throw new APIError("BAD_REQUEST", {
					message: BASE_ERROR_CODES.SESSION_EXPIRED,
				});
			}
		}

		const beforeDelete = ctx.context.options.user.deleteUser?.beforeDelete;
		if (beforeDelete) {
			await beforeDelete(session.user, ctx.request);
		}
		await ctx.context.internalAdapter.deleteUser(session.user.id);
		await ctx.context.internalAdapter.deleteSessions(session.user.id);
		await ctx.context.internalAdapter.deleteAccounts(session.user.id);
		deleteSessionCookie(ctx);
		const afterDelete = ctx.context.options.user.deleteUser?.afterDelete;
		if (afterDelete) {
			await afterDelete(session.user, ctx.request);
		}
		return ctx.json({
			success: true,
			message: "User deleted",
		});
	});

export const deleteUserCallback = () =>
	implEndpoint(
		deleteUserCallbackDef,
		[originCheck((ctx) => ctx.query.callbackURL)],
		async (ctx) => {
			if (!ctx.context.options.user?.deleteUser?.enabled) {
				ctx.context.logger.error(
					"Delete user is disabled. Enable it in the options",
				);
				throw new APIError("NOT_FOUND");
			}
			const session = await getSessionFromCtx(ctx);
			if (!session) {
				throw new APIError("NOT_FOUND", {
					message: BASE_ERROR_CODES.FAILED_TO_GET_USER_INFO,
				});
			}
			const token = await ctx.context.internalAdapter.findVerificationValue(
				`delete-account-${ctx.query.token}`,
			);
			if (!token || token.expiresAt < new Date()) {
				throw new APIError("NOT_FOUND", {
					message: BASE_ERROR_CODES.INVALID_TOKEN,
				});
			}
			if (token.value !== session.user.id) {
				throw new APIError("NOT_FOUND", {
					message: BASE_ERROR_CODES.INVALID_TOKEN,
				});
			}
			const beforeDelete = ctx.context.options.user.deleteUser?.beforeDelete;
			if (beforeDelete) {
				await beforeDelete(session.user, ctx.request);
			}
			await ctx.context.internalAdapter.deleteUser(session.user.id);
			await ctx.context.internalAdapter.deleteSessions(session.user.id);
			await ctx.context.internalAdapter.deleteAccounts(session.user.id);
			await ctx.context.internalAdapter.deleteVerificationValue(token.id);

			deleteSessionCookie(ctx);

			const afterDelete = ctx.context.options.user.deleteUser?.afterDelete;
			if (afterDelete) {
				await afterDelete(session.user, ctx.request);
			}
			if (ctx.query.callbackURL) {
				throw ctx.redirect(ctx.query.callbackURL || "/");
			}
			return ctx.json({
				success: true,
				message: "User deleted",
			});
		},
	);

export const changeEmail = () =>
	implEndpoint(changeEmailDef, [sensitiveSessionMiddleware], async (ctx) => {
		if (!ctx.context.options.user?.changeEmail?.enabled) {
			ctx.context.logger.error("Change email is disabled.");
			throw new APIError("BAD_REQUEST", {
				message: "Change email is disabled",
			});
		}

		const newEmail = ctx.body.newEmail.toLowerCase();

		if (newEmail === ctx.context.session.user.email) {
			ctx.context.logger.error("Email is the same");
			throw new APIError("BAD_REQUEST", {
				message: "Email is the same",
			});
		}
		const existingUser =
			await ctx.context.internalAdapter.findUserByEmail(newEmail);
		if (existingUser) {
			ctx.context.logger.error("Email already exists");
			throw new APIError("BAD_REQUEST", {
				message: "Couldn't update your email",
			});
		}
		/**
		 * If the email is not verified, we can update the email
		 */
		if (ctx.context.session.user.emailVerified !== true) {
			const existing =
				await ctx.context.internalAdapter.findUserByEmail(newEmail);
			if (existing) {
				throw new APIError("UNPROCESSABLE_ENTITY", {
					message: BASE_ERROR_CODES.USER_ALREADY_EXISTS,
				});
			}
			await ctx.context.internalAdapter.updateUserByEmail(
				ctx.context.session.user.email,
				{
					email: newEmail,
				},
				ctx,
			);
			await setSessionCookie(ctx, {
				session: ctx.context.session.session,
				user: {
					...ctx.context.session.user,
					email: newEmail,
				},
			});
			if (ctx.context.options.emailVerification?.sendVerificationEmail) {
				const token = await createEmailVerificationToken(
					ctx.context.secret,
					newEmail,
					undefined,
					ctx.context.options.emailVerification?.expiresIn,
				);
				const url = `${
					ctx.context.baseURL
				}/verify-email?token=${token}&callbackURL=${
					ctx.body.callbackURL || "/"
				}`;
				await ctx.context.options.emailVerification.sendVerificationEmail(
					{
						user: {
							...ctx.context.session.user,
							email: newEmail,
						},
						url,
						token,
					},
					ctx.request,
				);
			}

			return ctx.json({
				status: true,
			});
		}

		/**
		 * If the email is verified, we need to send a verification email
		 */
		if (!ctx.context.options.user.changeEmail.sendChangeEmailVerification) {
			ctx.context.logger.error("Verification email isn't enabled.");
			throw new APIError("BAD_REQUEST", {
				message: "Verification email isn't enabled",
			});
		}

		const token = await createEmailVerificationToken(
			ctx.context.secret,
			ctx.context.session.user.email,
			newEmail,
			ctx.context.options.emailVerification?.expiresIn,
		);
		const url = `${
			ctx.context.baseURL
		}/verify-email?token=${token}&callbackURL=${ctx.body.callbackURL || "/"}`;
		await ctx.context.options.user.changeEmail.sendChangeEmailVerification(
			{
				user: ctx.context.session.user,
				newEmail: newEmail,
				url,
				token,
			},
			ctx.request,
		);
		return ctx.json({
			status: true,
		});
	});
