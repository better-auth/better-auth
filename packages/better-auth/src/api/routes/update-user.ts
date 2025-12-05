import type { BetterAuthOptions } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import { BASE_ERROR_CODES } from "@better-auth/core/error";
import { APIError } from "better-call";
import * as z from "zod";
import { deleteSessionCookie, setSessionCookie } from "../../cookies";
import { generateRandomString } from "../../crypto";
import { parseUserInput } from "../../db/schema";
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
											nullable: true,
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
			const body = ctx.body as {
				name?: string | undefined;
				image?: string | undefined;
				[key: string]: any;
			};

			if (body.email) {
				throw new APIError("BAD_REQUEST", {
					message: BASE_ERROR_CODES.EMAIL_CAN_NOT_BE_UPDATED,
				});
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
				throw new APIError("BAD_REQUEST", {
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
				responses: {
					"200": {
						description: "Password successfully changed",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										token: {
											type: "string",
											nullable: true, // Only present if revokeOtherSessions is true
											description:
												"New session token if other sessions were revoked",
										},
										user: {
											type: "object",
											properties: {
												id: {
													type: "string",
													description: "The unique identifier of the user",
												},
												email: {
													type: "string",
													format: "email",
													description: "The email address of the user",
												},
												name: {
													type: "string",
													description: "The name of the user",
												},
												image: {
													type: "string",
													format: "uri",
													nullable: true,
													description: "The profile image URL of the user",
												},
												emailVerified: {
													type: "boolean",
													description: "Whether the email has been verified",
												},
												createdAt: {
													type: "string",
													format: "date-time",
													description: "When the user was created",
												},
												updatedAt: {
													type: "string",
													format: "date-time",
													description: "When the user was last updated",
												},
											},
											required: [
												"id",
												"email",
												"name",
												"emailVerified",
												"createdAt",
												"updatedAt",
											],
										},
									},
									required: ["user"],
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
		let token = null;
		if (revokeOtherSessions) {
			await ctx.context.internalAdapter.deleteSessions(session.user.id);
			const newSession = await ctx.context.internalAdapter.createSession(
				session.user.id,
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
			newPassword: z.string().meta({
				description: "The new password to set is required",
			}),
		}),
		metadata: {
			SERVER_ONLY: true,
		},
		use: [sensitiveSessionMiddleware],
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
			return ctx.json({
				status: true,
			});
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
		metadata: {
			openapi: {
				operationId: "deleteUser",
				description: "Delete the user",
				requestBody: {
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									callbackURL: {
										type: "string",
										description:
											"The callback URL to redirect to after the user is deleted",
									},
									password: {
										type: "string",
										description:
											"The user's password. Required if session is not fresh",
									},
									token: {
										type: "string",
										description: "The deletion verification token",
									},
								},
							},
						},
					},
				},
				responses: {
					"200": {
						description: "User deletion processed successfully",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										success: {
											type: "boolean",
											description: "Indicates if the operation was successful",
										},
										message: {
											type: "string",
											enum: ["User deleted", "Verification email sent"],
											description: "Status message of the deletion process",
										},
									},
									required: ["success", "message"],
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
		metadata: {
			openapi: {
				description:
					"Callback to complete user deletion with verification token",
				responses: {
					"200": {
						description: "User successfully deleted",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										success: {
											type: "boolean",
											description: "Indicates if the deletion was successful",
										},
										message: {
											type: "string",
											enum: ["User deleted"],
											description: "Confirmation message",
										},
									},
									required: ["success", "message"],
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
		metadata: {
			openapi: {
				operationId: "changeEmail",
				responses: {
					"200": {
						description: "Email change request processed successfully",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										user: {
											type: "object",
											$ref: "#/components/schemas/User",
										},
										status: {
											type: "boolean",
											description: "Indicates if the request was successful",
										},
										message: {
											type: "string",
											enum: ["Email updated", "Verification email sent"],
											description: "Status message of the email change process",
											nullable: true,
										},
									},
									required: ["status"],
								},
							},
						},
					},
					"422": {
						description: "Unprocessable Entity. Email already exists",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
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
			throw new APIError("UNPROCESSABLE_ENTITY", {
				message: BASE_ERROR_CODES.USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL,
			});
		}

		/**
		 * If the email is not verified, we can update the email if the option is enabled
		 */
		if (
			ctx.context.session.user.emailVerified !== true &&
			ctx.context.options.user.changeEmail.updateEmailWithoutVerification
		) {
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
		const sendConfirmationToOldEmail =
			ctx.context.session.user.emailVerified &&
			(ctx.context.options.user.changeEmail.sendChangeEmailConfirmation ||
				ctx.context.options.user.changeEmail.sendChangeEmailVerification);

		if (sendConfirmationToOldEmail) {
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
			const sendFn =
				ctx.context.options.user.changeEmail.sendChangeEmailConfirmation ||
				ctx.context.options.user.changeEmail.sendChangeEmailVerification;
			if (sendFn) {
				await sendFn(
					{
						user: ctx.context.session.user,
						newEmail: newEmail,
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

		if (!ctx.context.options.emailVerification?.sendVerificationEmail) {
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
			{
				requestType: "change-email-verification",
			},
		);
		const url = `${
			ctx.context.baseURL
		}/verify-email?token=${token}&callbackURL=${ctx.body.callbackURL || "/"}`;
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
		return ctx.json({
			status: true,
		});
	},
);
