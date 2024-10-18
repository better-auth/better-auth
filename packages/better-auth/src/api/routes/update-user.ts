import { z } from "zod";
import { createAuthEndpoint } from "../call";
import { alphabet, generateRandomString } from "../../crypto/random";
import { setSessionCookie } from "../../cookies";
import { sessionMiddleware } from "./session";
import { APIError } from "better-call";
import { redirectURLMiddleware } from "../middlewares/redirect";
import { createEmailVerificationToken } from "./email-verification";

export const updateUser = createAuthEndpoint(
	"/user/update",
	{
		method: "POST",
		body: z.object({
			name: z.string().optional(),
			image: z.string().optional(),
		}),
		use: [sessionMiddleware, redirectURLMiddleware],
	},
	async (ctx) => {
		const { name, image } = ctx.body;
		const session = ctx.context.session;
		if (!image && !name) {
			return ctx.json({
				user: session.user,
			});
		}
		const user = await ctx.context.internalAdapter.updateUserByEmail(
			session.user.email,
			{
				name,
				image,
			},
		);
		return ctx.json({
			user,
		});
	},
);

export const changePassword = createAuthEndpoint(
	"/user/change-password",
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
			await setSessionCookie(ctx, newSession.id);
		}

		return ctx.json(session.user);
	},
);

export const setPassword = createAuthEndpoint(
	"/user/set-password",
	{
		method: "POST",
		body: z.object({
			/**
			 * The new password to set
			 */
			newPassword: z.string(),
		}),
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
	"/user/delete",
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
		return ctx.json(null);
	},
);

export const changeEmail = createAuthEndpoint(
	"/user/change-email",
	{
		method: "POST",
		query: z
			.object({
				currentURL: z.string().optional(),
			})
			.optional(),
		body: z.object({
			newEmail: z.string(),
			callbackURL: z.string().optional(),
		}),
		use: [sessionMiddleware, redirectURLMiddleware],
	},
	async (ctx) => {
		const existingUser = await ctx.context.internalAdapter.findUserByEmail(
			ctx.body.newEmail,
		);
		if (existingUser) {
			ctx.context.logger.error("Email already exists");
			throw new APIError("BAD_REQUEST", {
				message: "Couldn't update your email",
			});
		}
		if (ctx.context.options.user?.changeEmail?.disable === true) {
			ctx.context.logger.error("Change email is disabled.");
			throw new APIError("BAD_REQUEST", {
				message: "Change email is disabled",
			});
		}
		if (
			ctx.context.options.user?.changeEmail?.sendVerificationEmail === false
		) {
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

		if (!ctx.context.options.emailVerification?.sendVerificationEmail) {
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
		await ctx.context.options.emailVerification.sendVerificationEmail(
			ctx.context.session.user,
			url,
			token,
		);
		return ctx.json({
			user: null,
			status: true,
		});
	},
);
