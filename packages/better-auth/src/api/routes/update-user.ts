import { z, ZodObject, ZodOptional, ZodString } from "zod";
import { createAuthEndpoint } from "../call";

import { deleteSessionCookie, setSessionCookie } from "../../cookies";
import { sessionMiddleware } from "./session";
import { APIError } from "better-call";
import { createEmailVerificationToken } from "./email-verification";
import type { toZod } from "../../types/to-zod";
import type { AdditionalUserFieldsInput, BetterAuthOptions } from "../../types";
import { parseUserInput } from "../../db/schema";

export const updateUser = <O extends BetterAuthOptions>() =>
	createAuthEndpoint(
		"/update-user",
		{
			method: "POST",
			body: z.record(z.string(), z.any()) as unknown as ZodObject<{
				name: ZodOptional<ZodString>;
				image: ZodOptional<ZodString>;
			}> &
				toZod<AdditionalUserFieldsInput<O>>,
			use: [sessionMiddleware],
		},
		async (ctx) => {
			const body = ctx.body as {
				name?: string;
				image?: string;
				[key: string]: any;
			};

			if (body.email) {
				throw new APIError("BAD_REQUEST", {
					message: "You can't update email",
				});
			}
			const { name, image, ...rest } = body;
			const session = ctx.context.session;
			if (!image && !name && Object.keys(rest).length === 0) {
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
			newPassword: z.string(),
			/**
			 * The current password of the user
			 */
			currentPassword: z.string(),
			/**
			 * revoke all sessions that are not the
			 * current one logged in by the user
			 */
			revokeOtherSessions: z.boolean().optional(),
		}),
		use: [sessionMiddleware],
	},
	async (ctx) => {
		const { newPassword, currentPassword, revokeOtherSessions } = ctx.body;
		const session = ctx.context.session;
		const minPasswordLength = ctx.context.password.config.minPasswordLength;
		if (newPassword.length < minPasswordLength) {
			ctx.context.logger.error("Password is too short");
			throw new APIError("BAD_REQUEST", {
				message: "Password is too short",
			});
		}

		const maxPasswordLength = ctx.context.password.config.maxPasswordLength;

		if (newPassword.length > maxPasswordLength) {
			ctx.context.logger.error("Password is too long");
			throw new APIError("BAD_REQUEST", {
				message: "Password too long",
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
				message: "User does not have a password",
			});
		}
		const passwordHash = await ctx.context.password.hash(newPassword);
		const verify = await ctx.context.password.verify(
			account.password,
			currentPassword,
		);
		if (!verify) {
			throw new APIError("BAD_REQUEST", {
				message: "Incorrect password",
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
					message: "Unable to create session",
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
				message: "Password is too short",
			});
		}

		const maxPasswordLength = ctx.context.password.config.maxPasswordLength;

		if (newPassword.length > maxPasswordLength) {
			ctx.context.logger.error("Password is too long");
			throw new APIError("BAD_REQUEST", {
				message: "Password too long",
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
		body: z.object({
			password: z.string(),
		}),
		use: [sessionMiddleware],
	},
	async (ctx) => {
		const { password } = ctx.body;
		const session = ctx.context.session;
		const accounts = await ctx.context.internalAdapter.findAccounts(
			session.user.id,
		);
		const account = accounts.find(
			(account) => account.providerId === "credential" && account.password,
		);
		if (!account || !account.password) {
			throw new APIError("BAD_REQUEST", {
				message: "User does not have a password",
			});
		}
		const verify = await ctx.context.password.verify(
			account.password,
			password,
		);
		if (!verify) {
			throw new APIError("BAD_REQUEST", {
				message: "Incorrect password",
			});
		}
		await ctx.context.internalAdapter.deleteUser(session.user.id);
		await ctx.context.internalAdapter.deleteSessions(session.user.id);
		deleteSessionCookie(ctx);
		return ctx.json(null);
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
			newEmail: z.string().email(),
			callbackURL: z.string().optional(),
		}),
		use: [sessionMiddleware],
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
			ctx.context.session.user,
			ctx.body.newEmail,
			url,
			token,
		);
		return ctx.json({
			user: null,
			status: true,
		});
	},
);
