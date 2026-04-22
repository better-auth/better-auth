import type { BetterAuthOptions } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError, BASE_ERROR_CODES } from "@better-auth/core/error";
import * as z from "zod";
import { deleteSessionCookie, setSessionCookie } from "../../cookies";
import { generateRandomString } from "../../crypto";
import { parseUserInput, parseUserOutput } from "../../db/schema";
import type { AdditionalUserFieldsInput } from "../../types";
import { originCheck } from "../middlewares";
import { createEmailVerificationToken } from "./email-verification";
import {
	getSessionFromCtx,
	sensitiveSessionMiddleware,
	sessionMiddleware,
} from "./session";

const updateUserBodySchema = z.record(
	z.string().meta({
		description: "Field name must be a string",
	}),
	z.any(),
);

export const updateUser = <O extends BetterAuthOptions>() =>
	createAuthEndpoint(
		"/update-user",
		{
			method: "POST",
			operationId: "updateUser",
			body: updateUserBodySchema,
			use: [sessionMiddleware],
			response: z.object({
				status: z.boolean(),
			}),
			errors: [
				"BAD_REQUEST",
				"BODY_MUST_BE_AN_OBJECT",
				"EMAIL_CAN_NOT_BE_UPDATED",
			],
			metadata: {
				$Infer: {
					body: {} as Partial<AdditionalUserFieldsInput<O>> & {
						name?: string | undefined;
						image?: string | undefined | null;
					},
				},
				openapi: {
					operationId: "updateUser",
					description: "Update the current user",
				},
			},
		},
		async (ctx) => {
			const body = ctx.body as {
				name?: string | undefined;
				image?: string | undefined;
				[key: string]: any;
			};

			if (typeof body !== "object" || Array.isArray(body)) {
				throw APIError.from(
					"BAD_REQUEST",
					BASE_ERROR_CODES.BODY_MUST_BE_AN_OBJECT,
				);
			}

			if (body.email) {
				throw APIError.from(
					"BAD_REQUEST",
					BASE_ERROR_CODES.EMAIL_CAN_NOT_BE_UPDATED,
				);
			}
			const { name, image, ...rest } = body;
			const session = ctx.context.session;
			const additionalFields = parseUserInput(
				ctx.context.options,
				rest,
				"update",
			);
			if (
				image === undefined &&
				name === undefined &&
				Object.keys(additionalFields).length === 0
			) {
				throw APIError.fromStatus("BAD_REQUEST", {
					message: "No fields to update",
				});
			}
			const user = await ctx.context.internalAdapter.updateUser(
				session.user.id,
				{
					name,
					image,
					...additionalFields,
				},
			);
			const updatedUser = user ?? {
				...session.user,
				...(name !== undefined && { name }),
				...(image !== undefined && { image }),
				...additionalFields,
			};
			/**
			 * Update the session cookie with the new user data
			 */
			await setSessionCookie(ctx, {
				session: session.session,
				user: updatedUser,
			});
			return ctx.json({
				status: true,
			});
		},
	);

export const changePassword = createAuthEndpoint(
	"/change-password",
	{
		method: "POST",
		operationId: "changePassword",
		body: z.object({
			/**
			 * The new password to set
			 */
			newPassword: z.string().meta({
				description: "The new password to set",
			}),
			/**
			 * The current password of the user
			 */
			currentPassword: z.string().meta({
				description: "The current password is required",
			}),
			/**
			 * revoke all sessions that are not the
			 * current one logged in by the user
			 */
			revokeOtherSessions: z
				.boolean()
				.meta({
					description: "Must be a boolean value",
				})
				.optional(),
		}),
		use: [sensitiveSessionMiddleware],
		metadata: {
			openapi: {
				operationId: "changePassword",
				description: "Change the password of the user",
			},
		},
		response: z.object({
			token: z.string().nullable().meta({
				description:
					"New session token if revokeOtherSessions was requested; otherwise null",
			}),
			user: z.object({
				id: z.string(),
				email: z.email(),
				name: z.string(),
				image: z.string().nullable(),
				emailVerified: z.boolean(),
				createdAt: z.string().meta({ format: "date-time" }),
				updatedAt: z.string().meta({ format: "date-time" }),
			}),
		}),
		errors: [
			"BAD_REQUEST",
			"INTERNAL_SERVER_ERROR",
			"PASSWORD_TOO_SHORT",
			"PASSWORD_TOO_LONG",
			"CREDENTIAL_ACCOUNT_NOT_FOUND",
			"INVALID_PASSWORD",
			"FAILED_TO_GET_SESSION",
		],
	},
	async (ctx) => {
		const { newPassword, currentPassword, revokeOtherSessions } = ctx.body;
		const session = ctx.context.session;
		const minPasswordLength = ctx.context.password.config.minPasswordLength;
		if (newPassword.length < minPasswordLength) {
			ctx.context.logger.error("Password is too short");
			throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.PASSWORD_TOO_SHORT);
		}

		const maxPasswordLength = ctx.context.password.config.maxPasswordLength;

		if (newPassword.length > maxPasswordLength) {
			ctx.context.logger.error("Password is too long");
			throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.PASSWORD_TOO_LONG);
		}

		const accounts = await ctx.context.internalAdapter.findAccounts(
			session.user.id,
		);
		const account = accounts.find(
			(account) => account.providerId === "credential" && account.password,
		);
		if (!account || !account.password) {
			throw APIError.from(
				"BAD_REQUEST",
				BASE_ERROR_CODES.CREDENTIAL_ACCOUNT_NOT_FOUND,
			);
		}
		const passwordHash = await ctx.context.password.hash(newPassword);
		const verify = await ctx.context.password.verify({
			hash: account.password,
			password: currentPassword,
		});
		if (!verify) {
			throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.INVALID_PASSWORD);
		}
		await ctx.context.internalAdapter.updateAccount(account.id, {
			password: passwordHash,
		});
		let token = null;
		if (revokeOtherSessions) {
			await ctx.context.internalAdapter.deleteSessions(session.user.id);
			const newSession = await ctx.context.internalAdapter.createSession(
				session.user.id,
			);
			if (!newSession) {
				throw APIError.from(
					"INTERNAL_SERVER_ERROR",
					BASE_ERROR_CODES.FAILED_TO_GET_SESSION,
				);
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
			user: parseUserOutput(ctx.context.options, session.user),
		});
	},
);

export const setPassword = createAuthEndpoint(
	{
		method: "POST",
		body: z.object({
			/**
			 * The new password to set
			 */
			newPassword: z.string().meta({
				description: "The new password to set is required",
			}),
		}),
		use: [sensitiveSessionMiddleware],
	},
	async (ctx) => {
		const { newPassword } = ctx.body;
		const session = ctx.context.session;
		const minPasswordLength = ctx.context.password.config.minPasswordLength;
		if (newPassword.length < minPasswordLength) {
			ctx.context.logger.error("Password is too short");
			throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.PASSWORD_TOO_SHORT);
		}

		const maxPasswordLength = ctx.context.password.config.maxPasswordLength;

		if (newPassword.length > maxPasswordLength) {
			ctx.context.logger.error("Password is too long");
			throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.PASSWORD_TOO_LONG);
		}

		const accounts = await ctx.context.internalAdapter.findAccounts(
			session.user.id,
		);
		const account = accounts.find(
			(account) => account.providerId === "credential" && account.password,
		);
		const passwordHash = await ctx.context.password.hash(newPassword);
		if (!account) {
			await ctx.context.internalAdapter.linkAccount({
				userId: session.user.id,
				providerId: "credential",
				accountId: session.user.id,
				password: passwordHash,
			});
			return ctx.json({
				status: true,
			});
		}
		throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.PASSWORD_ALREADY_SET);
	},
);

export const deleteUser = createAuthEndpoint(
	"/delete-user",
	{
		method: "POST",
		use: [sensitiveSessionMiddleware],
		body: z.object({
			/**
			 * The callback URL to redirect to after the user is deleted
			 * this is only used on delete user callback
			 */
			callbackURL: z
				.string()
				.meta({
					description:
						"The callback URL to redirect to after the user is deleted",
				})
				.optional(),
			/**
			 * The password of the user. If the password isn't provided, session freshness
			 * will be checked.
			 */
			password: z
				.string()
				.meta({
					description:
						"The password of the user is required to delete the user",
				})
				.optional(),
			/**
			 * The token to delete the user. If the token is provided, the user will be deleted
			 */
			token: z
				.string()
				.meta({
					description: "The token to delete the user is required",
				})
				.optional(),
		}),
		response: z.object({
			success: z.boolean().meta({
				description: "Indicates if the operation was successful",
			}),
			message: z
				.enum(["User deleted", "Verification email sent"])
				.meta({ description: "Status message of the deletion process" }),
		}),
		errors: [
			"BAD_REQUEST",
			"NOT_FOUND",
			"CREDENTIAL_ACCOUNT_NOT_FOUND",
			"INVALID_PASSWORD",
			"SESSION_EXPIRED",
		],
		metadata: {
			openapi: {
				operationId: "deleteUser",
				description: "Delete the user",
			},
		},
	},
	async (ctx) => {
		if (!ctx.context.options.user?.deleteUser?.enabled) {
			ctx.context.logger.error(
				"Delete user is disabled. Enable it in the options",
			);
			throw APIError.fromStatus("NOT_FOUND");
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
				throw APIError.from(
					"BAD_REQUEST",
					BASE_ERROR_CODES.CREDENTIAL_ACCOUNT_NOT_FOUND,
				);
			}
			const verify = await ctx.context.password.verify({
				hash: account.password,
				password: ctx.body.password,
			});
			if (!verify) {
				throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.INVALID_PASSWORD);
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
			await ctx.context.internalAdapter.createVerificationValue({
				value: session.user.id,
				identifier: `delete-account-${token}`,
				expiresAt: new Date(
					Date.now() +
						(ctx.context.options.user.deleteUser?.deleteTokenExpiresIn ||
							60 * 60 * 24) *
							1000,
				),
			});
			const url = `${
				ctx.context.baseURL
			}/delete-user/callback?token=${token}&callbackURL=${encodeURIComponent(
				ctx.body.callbackURL || "/",
			)}`;
			await ctx.context.runInBackgroundOrAwait(
				ctx.context.options.user.deleteUser.sendDeleteAccountVerification(
					{
						user: session.user,
						url,
						token,
					},
					ctx.request,
				),
			);
			return ctx.json({
				success: true,
				message: "Verification email sent",
			});
		}

		if (!ctx.body.password && ctx.context.sessionConfig.freshAge !== 0) {
			const createdAt = new Date(session.session.createdAt).getTime();
			const freshAge = ctx.context.sessionConfig.freshAge * 1000;
			if (Date.now() - createdAt >= freshAge) {
				throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.SESSION_EXPIRED);
			}
		}

		const beforeDelete = ctx.context.options.user.deleteUser?.beforeDelete;
		if (beforeDelete) {
			await beforeDelete(session.user, ctx.request);
		}
		await ctx.context.internalAdapter.deleteUser(session.user.id);
		await ctx.context.internalAdapter.deleteSessions(session.user.id);
		deleteSessionCookie(ctx);
		const afterDelete = ctx.context.options.user.deleteUser?.afterDelete;
		if (afterDelete) {
			await afterDelete(session.user, ctx.request);
		}
		return ctx.json({
			success: true,
			message: "User deleted",
		});
	},
);

export const deleteUserCallback = createAuthEndpoint(
	"/delete-user/callback",
	{
		method: "GET",
		query: z.object({
			token: z.string().meta({
				description: "The token to verify the deletion request",
			}),
			callbackURL: z
				.string()
				.meta({
					description: "The URL to redirect to after deletion",
				})
				.optional(),
		}),
		use: [originCheck((ctx) => ctx.query.callbackURL)],
		response: z.object({
			success: z.boolean(),
			message: z.enum(["User deleted"]),
		}),
		errors: ["NOT_FOUND", "INVALID_TOKEN", "FAILED_TO_GET_USER_INFO"],
		metadata: {
			openapi: {
				description:
					"Callback to complete user deletion with verification token",
			},
		},
	},
	async (ctx) => {
		if (!ctx.context.options.user?.deleteUser?.enabled) {
			ctx.context.logger.error(
				"Delete user is disabled. Enable it in the options",
			);
			throw APIError.from("NOT_FOUND", {
				message: "Not found",
				code: "NOT_FOUND",
			});
		}
		const session = await getSessionFromCtx(ctx);
		if (!session) {
			throw APIError.from(
				"NOT_FOUND",
				BASE_ERROR_CODES.FAILED_TO_GET_USER_INFO,
			);
		}
		const token = await ctx.context.internalAdapter.findVerificationValue(
			`delete-account-${ctx.query.token}`,
		);
		if (!token || token.expiresAt < new Date()) {
			throw APIError.from("NOT_FOUND", BASE_ERROR_CODES.INVALID_TOKEN);
		}
		if (token.value !== session.user.id) {
			throw APIError.from("NOT_FOUND", BASE_ERROR_CODES.INVALID_TOKEN);
		}
		const beforeDelete = ctx.context.options.user.deleteUser?.beforeDelete;
		if (beforeDelete) {
			await beforeDelete(session.user, ctx.request);
		}
		await ctx.context.internalAdapter.deleteUser(session.user.id);
		await ctx.context.internalAdapter.deleteSessions(session.user.id);
		await ctx.context.internalAdapter.deleteAccounts(session.user.id);
		await ctx.context.internalAdapter.deleteVerificationByIdentifier(
			`delete-account-${ctx.query.token}`,
		);

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

export const changeEmail = createAuthEndpoint(
	"/change-email",
	{
		method: "POST",
		body: z.object({
			newEmail: z.email().meta({
				description:
					"The new email address to set must be a valid email address",
			}),
			callbackURL: z
				.string()
				.meta({
					description: "The URL to redirect to after email verification",
				})
				.optional(),
		}),
		use: [sensitiveSessionMiddleware],
		response: z.object({
			user: z.record(z.string(), z.any()).optional().meta({
				description: "The updated user (when email update is immediate)",
			}),
			status: z
				.boolean()
				.meta({ description: "Indicates if the request was successful" }),
			message: z
				.enum(["Email updated", "Verification email sent"])
				.nullable()
				.optional(),
		}),
		errors: ["BAD_REQUEST"],
		metadata: {
			openapi: {
				operationId: "changeEmail",
			},
		},
	},
	async (ctx) => {
		if (!ctx.context.options.user?.changeEmail?.enabled) {
			ctx.context.logger.error("Change email is disabled.");
			throw APIError.fromStatus("BAD_REQUEST", {
				message: "Change email is disabled",
			});
		}

		const newEmail = ctx.body.newEmail.toLowerCase();

		if (newEmail === ctx.context.session.user.email) {
			ctx.context.logger.error("Email is the same");
			throw APIError.fromStatus("BAD_REQUEST", {
				message: "Email is the same",
			});
		}

		/**
		 * Early config check: ensure at least one email-change flow is
		 * available for the current session state. Without this, an
		 * existing-email lookup would return 200 while a non-existing
		 * email would later throw 400, leaking email existence.
		 */
		const canUpdateWithoutVerification =
			ctx.context.session.user.emailVerified !== true &&
			ctx.context.options.user.changeEmail.updateEmailWithoutVerification;
		const canSendConfirmation =
			ctx.context.session.user.emailVerified &&
			ctx.context.options.user.changeEmail.sendChangeEmailConfirmation;
		const canSendVerification =
			ctx.context.options.emailVerification?.sendVerificationEmail;

		if (
			!canUpdateWithoutVerification &&
			!canSendConfirmation &&
			!canSendVerification
		) {
			ctx.context.logger.error("Verification email isn't enabled.");
			throw APIError.fromStatus("BAD_REQUEST", {
				message: "Verification email isn't enabled",
			});
		}

		const existingUser =
			await ctx.context.internalAdapter.findUserByEmail(newEmail);
		if (existingUser) {
			// Simulate token generation to prevent timing attacks
			await createEmailVerificationToken(
				ctx.context.secret,
				ctx.context.session.user.email,
				newEmail,
				ctx.context.options.emailVerification?.expiresIn,
			);

			ctx.context.logger.info("Change email attempt for existing email");

			return ctx.json({ status: true });
		}

		/**
		 * If the email is not verified, we can update the email if the option is enabled
		 */
		if (canUpdateWithoutVerification) {
			await ctx.context.internalAdapter.updateUserByEmail(
				ctx.context.session.user.email,
				{
					email: newEmail,
				},
			);
			await setSessionCookie(ctx, {
				session: ctx.context.session.session,
				user: {
					...ctx.context.session.user,
					email: newEmail,
				},
			});
			if (canSendVerification) {
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
				await ctx.context.runInBackgroundOrAwait(
					canSendVerification(
						{
							user: {
								...ctx.context.session.user,
								email: newEmail,
							},
							url,
							token,
						},
						ctx.request,
					),
				);
			}

			return ctx.json({
				status: true,
			});
		}

		/**
		 * If the email is verified, we need to send a verification email
		 */
		if (canSendConfirmation) {
			const token = await createEmailVerificationToken(
				ctx.context.secret,
				ctx.context.session.user.email,
				newEmail,
				ctx.context.options.emailVerification?.expiresIn,
				{
					requestType: "change-email-confirmation",
				},
			);
			const url = `${
				ctx.context.baseURL
			}/verify-email?token=${token}&callbackURL=${ctx.body.callbackURL || "/"}`;
			await ctx.context.runInBackgroundOrAwait(
				canSendConfirmation(
					{
						user: ctx.context.session.user,
						newEmail: newEmail,
						url,
						token,
					},
					ctx.request,
				),
			);
			return ctx.json({
				status: true,
			});
		}

		if (!canSendVerification) {
			ctx.context.logger.error("Verification email isn't enabled.");
			throw APIError.fromStatus("BAD_REQUEST", {
				message: "Verification email isn't enabled",
			});
		}

		const token = await createEmailVerificationToken(
			ctx.context.secret,
			ctx.context.session.user.email,
			newEmail,
			ctx.context.options.emailVerification?.expiresIn,
			{
				requestType: "change-email-verification",
			},
		);
		const url = `${
			ctx.context.baseURL
		}/verify-email?token=${token}&callbackURL=${ctx.body.callbackURL || "/"}`;
		await ctx.context.runInBackgroundOrAwait(
			canSendVerification(
				{
					user: {
						...ctx.context.session.user,
						email: newEmail,
					},
					url,
					token,
				},
				ctx.request,
			),
		);
		return ctx.json({
			status: true,
		});
	},
);
