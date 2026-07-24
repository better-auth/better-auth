import type { BetterAuthOptions } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError, BASE_ERROR_CODES } from "@better-auth/core/error";
import { generateId } from "@better-auth/core/utils/id";
import * as z from "zod";
import { deleteSessionCookie, setSessionCookie } from "../../cookies";
import { generateRandomString } from "../../crypto";
import { parseUserInput, parseUserOutput } from "../../db/schema";
import type { AdditionalUserFieldsInput } from "../../types";
import { getDate } from "../../utils/date";
import { originCheck } from "../middlewares";
import { createEmailVerificationToken } from "./email-verification";
import {
	getSessionFromCtx,
	isStateful,
	sensitiveSessionMiddleware,
	sessionMiddleware,
} from "./session";

const updateUserBodySchema = z.record(
	z.string().meta({
		description: "Field name must be a string",
	}),
	z.any(),
);

/**
 * Identifier for a pending email change stored in the verification table.
 *
 * The token is part of the key, not just the payload, so that
 * `consumeVerificationValue` claims *this* request atomically. Keying by user
 * alone would let a stale link consume a newer request's row, and would let a
 * request carrying a bogus token discard a legitimate pending change.
 *
 * Which request is current is decided by `user.pendingEmail`, not by this row:
 * superseded rows are left to expire and are rejected on use.
 */
const changeEmailIdentifier = (userId: string, token: string) =>
	`change-email:${userId}:${token}`;

/** Fallback lifetime for a pending email change, in seconds. */
const DEFAULT_CHANGE_EMAIL_EXPIRES_IN = 60 * 60;

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
			ctx.context.logger.warn("Password is too short");
			throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.PASSWORD_TOO_SHORT);
		}

		const maxPasswordLength = ctx.context.password.config.maxPasswordLength;

		if (newPassword.length > maxPasswordLength) {
			ctx.context.logger.warn("Password is too long");
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
			await ctx.context.internalAdapter.deleteUserSessions(session.user.id);
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

export const setPassword = createAuthEndpoint.serverOnly(
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
			ctx.context.logger.warn("Password is too short");
			throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.PASSWORD_TOO_SHORT);
		}

		const maxPasswordLength = ctx.context.password.config.maxPasswordLength;

		if (newPassword.length > maxPasswordLength) {
			ctx.context.logger.warn("Password is too long");
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
		await ctx.context.internalAdapter.deleteUserSessions(session.user.id);
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
			throw APIError.from("NOT_FOUND", {
				message: "Not found",
				code: "NOT_FOUND",
			});
		}
		// Account deletion is sensitive: bypass the cookie cache on stateful
		// deployments so a revoked-but-cached session cannot complete the deletion
		// even when paired with a valid delete-account token.
		const session = await getSessionFromCtx(ctx, {
			disableCookieCache: isStateful(ctx),
		});
		if (!session) {
			throw APIError.from(
				"NOT_FOUND",
				BASE_ERROR_CODES.FAILED_TO_GET_USER_INFO,
			);
		}
		// Consume the single-use delete token atomically before any
		// destructive work so concurrent callbacks with the same token can
		// only delete the account once: the first caller wins, later racers
		// get null. A wrong-owner token is still burned by this consume.
		const token = await ctx.context.internalAdapter.consumeVerificationValue(
			`delete-account-${ctx.query.token}`,
		);
		if (!token || token.value !== session.user.id) {
			throw APIError.from("NOT_FOUND", BASE_ERROR_CODES.INVALID_TOKEN);
		}
		const beforeDelete = ctx.context.options.user.deleteUser?.beforeDelete;
		if (beforeDelete) {
			await beforeDelete(session.user, ctx.request);
		}
		await ctx.context.internalAdapter.deleteUser(session.user.id);
		await ctx.context.internalAdapter.deleteUserSessions(session.user.id);
		await ctx.context.internalAdapter.deleteAccounts(session.user.id);

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
				},
			},
		},
	},
	async (ctx) => {
		if (!ctx.context.options.user?.changeEmail?.enabled) {
			ctx.context.logger.error("Change email is disabled.");
			throw APIError.from(
				"BAD_REQUEST",
				BASE_ERROR_CODES.CHANGE_EMAIL_DISABLED,
			);
		}

		const newEmail = ctx.body.newEmail.toLowerCase();

		if (newEmail === ctx.context.session.user.email) {
			ctx.context.logger.warn("Email is the same");
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
		const changeEmailOptions = ctx.context.options.user.changeEmail;
		const useVerificationTable =
			(changeEmailOptions.strategy ?? "jwt") === "verification-table";

		/**
		 * Verification of the *account* (as opposed to the email change itself) always
		 * goes through `emailVerification.sendVerificationEmail`, whatever the strategy.
		 */
		const sendAccountVerification =
			ctx.context.options.emailVerification?.sendVerificationEmail;

		const canUpdateWithoutVerification =
			ctx.context.session.user.emailVerified !== true &&
			changeEmailOptions.updateEmailWithoutVerification;
		/**
		 * The callback that carries the change-email verification for the active
		 * strategy. `verification-table` uses its own dedicated callback, which is what
		 * decouples change-email mails from sign-up mails.
		 */
		const canSendVerification = useVerificationTable
			? changeEmailOptions.sendVerificationEmail
			: sendAccountVerification;
		/**
		 * Confirmation to the *old* address is specific to the `jwt` strategy: the
		 * `verification-table` strategy replaces it with a dedicated callback and a
		 * cancellable pending state.
		 */
		const canSendConfirmation =
			!useVerificationTable &&
			sendAccountVerification &&
			ctx.context.session.user.emailVerified &&
			changeEmailOptions.sendChangeEmailConfirmation;

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
			if (sendAccountVerification) {
				const token = await createEmailVerificationToken(
					ctx.context.secret,
					newEmail,
					undefined,
					ctx.context.options.emailVerification?.expiresIn,
				);
				const url = `${
					ctx.context.baseURL
				}/verify-email?token=${token}&callbackURL=${encodeURIComponent(
					ctx.body.callbackURL || "/",
				)}`;
				await ctx.context.runInBackgroundOrAwait(
					sendAccountVerification(
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
			}/verify-email?token=${token}&callbackURL=${encodeURIComponent(
				ctx.body.callbackURL || "/",
			)}`;
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

		if (useVerificationTable) {
			const userId = ctx.context.session.user.id;
			const verificationToken = generateId(24);
			const identifier = changeEmailIdentifier(userId, verificationToken);
			const expiresAt = getDate(
				ctx.context.options.emailVerification?.expiresIn ||
					DEFAULT_CHANGE_EMAIL_EXPIRES_IN,
				"sec",
			);

			/**
			 * The row is keyed by token, so requests never overwrite each other and a
			 * link can only ever consume its own row.
			 *
			 * `user.pendingEmail` selects the current *target address*, and verification
			 * cross-checks against it: requesting a different address makes every earlier
			 * link inert. Requesting the *same* address twice leaves both links valid —
			 * they lead to the same outcome, so there is nothing to arbitrate between
			 * them. Rows are never deleted here; they expire.
			 *
			 * (Deleting earlier rows by identifier prefix isn't an option: with
			 * `verification.storeIdentifier` set to `"hashed"`, stored identifiers share
			 * no prefix with the plaintext ones.)
			 */
			await ctx.context.internalAdapter.createVerificationValue({
				value: JSON.stringify({
					oldEmail: ctx.context.session.user.email,
					newEmail,
				}),
				identifier,
				expiresAt,
			});
			await ctx.context.internalAdapter.updateUser(userId, {
				pendingEmail: newEmail,
			});

			if (changeEmailOptions.onChangeEmailRequested) {
				await ctx.context.runInBackgroundOrAwait(
					changeEmailOptions.onChangeEmailRequested(
						{ user: ctx.context.session.user, newEmail },
						ctx.request,
					),
				);
			}

			const url = `${
				ctx.context.baseURL
			}/verify-email-change/${userId}/${verificationToken}?callbackURL=${encodeURIComponent(
				ctx.body.callbackURL || "/",
			)}`;

			/**
			 * If the send fails, roll the pending state back rather than leaving the user
			 * with a `pendingEmail` and a token they never received.
			 */
			try {
				await canSendVerification(
					{
						user: {
							...ctx.context.session.user,
							email: newEmail,
						},
						url,
						token: verificationToken,
					},
					ctx.request,
				);
			} catch (e) {
				await ctx.context.internalAdapter.updateUser(userId, {
					pendingEmail: null,
				});
				await ctx.context.internalAdapter.deleteVerificationByIdentifier(
					identifier,
				);
				throw e;
			}

			return ctx.json({ status: true });
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
		}/verify-email?token=${token}&callbackURL=${encodeURIComponent(
			ctx.body.callbackURL || "/",
		)}`;
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

/**
 * ### Endpoint
 *
 * POST `/cancel-email-change`
 *
 * ### API Methods
 *
 * **server:**
 * `auth.api.cancelEmailChange`
 *
 * **client:**
 * `authClient.cancelEmailChange`
 *
 * Returns `404` unless `user.changeEmail.strategy` is `"verification-table"`.
 */
export const cancelEmailChange = createAuthEndpoint(
	"/cancel-email-change",
	{
		method: "POST",
		use: [sessionMiddleware],
		metadata: {
			openapi: {
				operationId: "cancelEmailChange",
				summary: "Cancel a pending email change",
				description:
					"Discard a pending email change and clear the user's pendingEmail.",
				responses: {
					"200": {
						description: "Pending email change cancelled",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										status: {
											type: "boolean",
										},
									},
									required: ["status"],
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
			throw APIError.from(
				"BAD_REQUEST",
				BASE_ERROR_CODES.CHANGE_EMAIL_DISABLED,
			);
		}
		/**
		 * Registered unconditionally so the typed API surface stays stable (same
		 * convention as `deleteUser`), but only meaningful under the strategy that
		 * persists a pending change.
		 */
		if (
			ctx.context.options.user.changeEmail.strategy !== "verification-table"
		) {
			ctx.context.logger.error(
				'Cancelling an email change requires user.changeEmail.strategy: "verification-table".',
			);
			throw APIError.fromStatus("NOT_FOUND");
		}

		/**
		 * Clearing `pendingEmail` is what cancels the change: verification cross-checks
		 * against it, so any outstanding link is inert from here on and its row simply
		 * expires. Nothing needs deleting — and nothing can be deleted anyway, since the
		 * rows are keyed by token.
		 */
		const userId = ctx.context.session.user.id;
		await ctx.context.internalAdapter.updateUser(userId, {
			pendingEmail: null,
		});

		if (ctx.context.options.user.changeEmail.onChangeEmailCancelled) {
			await ctx.context.runInBackgroundOrAwait(
				ctx.context.options.user.changeEmail.onChangeEmailCancelled(
					{ user: ctx.context.session.user },
					ctx.request,
				),
			);
		}

		return ctx.json({ status: true });
	},
);

/**
 * ### Endpoint
 *
 * GET `/verify-email-change/:userId/:token`
 *
 * Verifies a pending email change and applies it. The verification row is consumed
 * atomically, so a token cannot be replayed.
 *
 * Returns `404` unless `user.changeEmail.strategy` is `"verification-table"`.
 */
export const verifyEmailChange = createAuthEndpoint(
	"/verify-email-change/:userId/:token",
	{
		method: "GET",
		query: z
			.object({
				callbackURL: z
					.string()
					.meta({
						description: "The URL to redirect to once the change is applied",
					})
					.optional(),
			})
			.optional(),
		use: [originCheck((ctx) => ctx.query?.callbackURL)],
		metadata: {
			openapi: {
				operationId: "verifyEmailChange",
				summary: "Verify a pending email change",
				description:
					"Consume the change-email token and apply the pending email address.",
				parameters: [
					{
						name: "userId",
						in: "path",
						required: true,
						schema: { type: "string" },
					},
					{
						name: "token",
						in: "path",
						required: true,
						schema: { type: "string" },
					},
					{
						name: "callbackURL",
						in: "query",
						required: false,
						schema: { type: "string" },
					},
				],
				responses: {
					"302": {
						description:
							"Redirects to callbackURL, or back to it with ?error=INVALID_TOKEN",
					},
				},
			},
		},
	},
	async (ctx) => {
		const { userId, token } = ctx.params;
		const callbackURL = ctx.query?.callbackURL || "/";
		const errorURL = `${callbackURL}${
			callbackURL.includes("?") ? "&" : "?"
		}error=INVALID_TOKEN`;

		/**
		 * Registered unconditionally so the typed API surface stays stable (same
		 * convention as `deleteUser`), but only meaningful under the strategy that
		 * persists a pending change.
		 */
		if (
			!ctx.context.options.user?.changeEmail?.enabled ||
			ctx.context.options.user.changeEmail.strategy !== "verification-table"
		) {
			throw ctx.redirect(errorURL);
		}

		if (!userId || !token) {
			throw ctx.redirect(errorURL);
		}

		/**
		 * The token is part of the key, so this claims exactly the row this link refers
		 * to — atomically, and without touching any other pending request. A bogus token
		 * addresses a row that doesn't exist and therefore consumes nothing; two
		 * concurrent clicks on the same link race for one row and only one wins.
		 */
		const verification =
			await ctx.context.internalAdapter.consumeVerificationValue(
				changeEmailIdentifier(userId, token),
			);

		if (!verification || verification.expiresAt < new Date()) {
			throw ctx.redirect(errorURL);
		}

		let pending: { oldEmail: string; newEmail: string };
		try {
			pending = JSON.parse(verification.value);
		} catch {
			throw ctx.redirect(errorURL);
		}

		/**
		 * `pendingEmail` is the authority on the current target address, so a link
		 * pointing at a superseded address is rejected here rather than by deleting rows
		 * — which is what lets a newer request survive an older link being clicked.
		 */
		const user = await ctx.context.internalAdapter.findUserById(userId);
		const currentPendingEmail = (
			user as { pendingEmail?: string | null } | null
		)?.pendingEmail;
		if (user && currentPendingEmail === undefined) {
			ctx.context.logger.warn(
				'user.pendingEmail is missing while changeEmail.strategy is "verification-table" — run your migrations, every verification link will be rejected until the column exists.',
			);
		}
		if (!user || currentPendingEmail !== pending.newEmail) {
			throw ctx.redirect(errorURL);
		}

		/**
		 * The address may have been taken between the request and the click.
		 */
		const existingUser = await ctx.context.internalAdapter.findUserByEmail(
			pending.newEmail,
		);
		if (existingUser) {
			await ctx.context.internalAdapter.updateUser(userId, {
				pendingEmail: null,
			});
			throw ctx.redirect(errorURL);
		}

		const updatedUser = await ctx.context.internalAdapter.updateUser(userId, {
			email: pending.newEmail,
			emailVerified: true,
			pendingEmail: null,
		});

		if (ctx.context.options.user?.changeEmail?.onChangeEmailCompleted) {
			await ctx.context.runInBackgroundOrAwait(
				ctx.context.options.user.changeEmail.onChangeEmailCompleted(
					{
						user: updatedUser,
						oldEmail: pending.oldEmail,
						newEmail: pending.newEmail,
					},
					ctx.request,
				),
			);
		}

		/**
		 * Revoke before minting the new session, otherwise the session issued below
		 * would be revoked along with the others.
		 */
		if (ctx.context.options.user.changeEmail.revokeOtherSessions) {
			await ctx.context.internalAdapter.deleteUserSessions(updatedUser.id);
		}

		const session = await ctx.context.internalAdapter.createSession(
			updatedUser.id,
		);
		if (session) {
			await setSessionCookie(ctx, {
				session,
				user: updatedUser,
			});
		}

		throw ctx.redirect(callbackURL);
	},
);
