import { z, ZodNull, ZodObject, ZodOptional, ZodString } from "zod";
import { createAuthEndpoint } from "../call";

import { deleteSessionCookie, setSessionCookie } from "../../cookies";
import {
	freshSessionMiddleware,
	getSessionFromCtx,
	sessionMiddleware,
} from "./session";
import { APIError } from "better-call";
import { createEmailVerificationToken } from "./email-verification";
import type { toZod } from "../../types/to-zod";
import type { AdditionalUserFieldsInput, BetterAuthOptions } from "../../types";
import { parseUserInput } from "../../db/schema";
import { alphabet, generateRandomString } from "../../crypto";
import { BASE_ERROR_CODES } from "../../error/codes";

export const updateUser = <O extends BetterAuthOptions>() =>
	createAuthEndpoint(
		"/update-user",
		{
			method: "POST",
			body: z.record(z.string(), z.any()) as unknown as toZod<
				AdditionalUserFieldsInput<O>
			> &
				ZodObject<{
					name: ZodOptional<ZodString>;
					image: ZodOptional<ZodString | ZodNull>;
				}>,
			use: [sessionMiddleware],
			metadata: {
				openapi: {
					description: "Update the current user",
					requestBody: {
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										name: {
											type: "string",
											description: "The name of the user",
										},
										image: {
											type: "string",
											description: "The image of the user",
										},
									},
								},
							},
						},
					},
					responses: {
						"200": {
							description: "Success",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											user: {
												type: "object",
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
			if (image === undefined && !name && Object.keys(rest).length === 0) {
				return ctx.json({
					user: session.user,
				});
			}
			const additionalFields = parseUserInput(
				ctx.context.options,
				rest,
				"update",
			);
			const user = await ctx.context.internalAdapter.updateUserByEmail(
				session.user.email,
				{
					name,
					image,
					...additionalFields,
				},
			);
			/**
			 * Update the session cookie with the new user data
			 */
			await setSessionCookie(ctx, {
				session: session.session,
				user,
			});
			return ctx.json({
				user,
			});
		},
	);

export const changePassword = createAuthEndpoint(
	"/change-password",
	{
		method: "POST",
		body: z.object({
			/**
			 * The new password to set
			 */
			newPassword: z.string({
				description: "The new password to set",
			}),
			/**
			 * The current password of the user
			 */
			currentPassword: z.string({
				description: "The current password",
			}),
			/**
			 * revoke all sessions that are not the
			 * current one logged in by the user
			 */
			revokeOtherSessions: z
				.boolean({
					description: "Revoke all other sessions",
				})
				.optional(),
		}),
		use: [sessionMiddleware],
		metadata: {
			openapi: {
				description: "Change the password of the user",
				responses: {
					"200": {
						description: "Success",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										user: {
											description: "The user object",
											$ref: "#/components/schemas/User",
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
		if (revokeOtherSessions) {
			await ctx.context.internalAdapter.deleteSessions(session.user.id);
			const newSession = await ctx.context.internalAdapter.createSession(
				session.user.id,
				ctx.headers,
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
		}

		return ctx.json(session.user);
	},
);

export const setPassword = createAuthEndpoint(
	"/set-password",
	{
		method: "POST",
		body: z.object({
			/**
			 * The new password to set
			 */
			newPassword: z.string(),
		}),
		metadata: {
			SERVER_ONLY: true,
		},
		use: [sessionMiddleware],
	},
	async (ctx) => {
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
			await ctx.context.internalAdapter.linkAccount({
				userId: session.user.id,
				providerId: "credential",
				accountId: session.user.id,
				password: passwordHash,
			});
			return ctx.json(session.user);
		}
		throw new APIError("BAD_REQUEST", {
			message: "user already has a password",
		});
	},
);

export const deleteUser = createAuthEndpoint(
	"/delete-user",
	{
		method: "POST",
		use: [freshSessionMiddleware],
		metadata: {
			openapi: {
				description: "Delete the user",
				responses: {
					"200": {
						description: "Success",
						content: {
							"application/json": {
								schema: {
									type: "object",
								},
							},
						},
					},
				},
			},
		},
	},
	async (ctx) => {
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

		if (ctx.context.options.user.deleteUser?.sendDeleteAccountVerification) {
			const token = generateRandomString(32, alphabet("a-z", "A-Z", "0-9"));
			await ctx.context.internalAdapter.createVerificationValue({
				value: session.user.id,
				identifier: `delete-account-${token}`,
				expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
			});
			const url = `${ctx.context.baseURL}/delete-user/callback?token=${token}`;
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
	},
);

export const deleteUserCallback = createAuthEndpoint(
	"/delete-user/callback",
	{
		method: "GET",
		query: z.object({
			token: z.string(),
		}),
	},
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
			if (token) {
				await ctx.context.internalAdapter.deleteVerificationValue(token.id);
			}
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
		query: z
			.object({
				currentURL: z.string().optional(),
			})
			.optional(),
		body: z.object({
			newEmail: z
				.string({
					description: "The new email to set",
				})
				.email(),
			callbackURL: z
				.string({
					description: "The URL to redirect to after email verification",
				})
				.optional(),
		}),
		use: [sessionMiddleware],
		metadata: {
			openapi: {
				responses: {
					"200": {
						description: "Success",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										user: {
											type: "object",
										},
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
		if (!ctx.context.options.user?.changeEmail?.enabled) {
			ctx.context.logger.error("Change email is disabled.");
			throw new APIError("BAD_REQUEST", {
				message: "Change email is disabled",
			});
		}

		if (ctx.body.newEmail === ctx.context.session.user.email) {
			ctx.context.logger.error("Email is the same");
			throw new APIError("BAD_REQUEST", {
				message: "Email is the same",
			});
		}
		const existingUser = await ctx.context.internalAdapter.findUserByEmail(
			ctx.body.newEmail,
		);
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
			const updatedUser = await ctx.context.internalAdapter.updateUserByEmail(
				ctx.context.session.user.email,
				{
					email: ctx.body.newEmail,
				},
			);
			return ctx.json({
				user: updatedUser,
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
			ctx.body.newEmail,
		);
		const url = `${
			ctx.context.baseURL
		}/verify-email?token=${token}&callbackURL=${
			ctx.body.callbackURL || ctx.query?.currentURL || "/"
		}`;
		await ctx.context.options.user.changeEmail.sendChangeEmailVerification(
			{
				user: ctx.context.session.user,
				newEmail: ctx.body.newEmail,
				url,
				token,
			},
			ctx.request,
		);
		return ctx.json({
			user: null,
			status: true,
		});
	},
);
