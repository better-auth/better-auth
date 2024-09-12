import { z } from "zod";
import { createAuthEndpoint } from "../call";
import { sessionMiddleware } from "../middlewares/session";
import { alphabet, generateRandomString } from "oslo/crypto";
import { setSessionCookie } from "../../utils/cookies";

export const updateUser = createAuthEndpoint(
	"/user/update",
	{
		method: "POST",
		body: z.object({
			name: z.string().optional(),
			image: z.string().optional(),
		}),
		use: [sessionMiddleware],
	},
	async (ctx) => {
		const { name, image } = ctx.body;
		const session = ctx.context.session;
		const user = await ctx.context.internalAdapter.updateUserByEmail(
			session.user.email,
			{
				name,
				image,
			},
		);
		return ctx.json(user);
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
		const minPasswordLength =
			ctx.context.options?.emailAndPassword?.minPasswordLength || 8;
		if (newPassword.length < minPasswordLength) {
			ctx.context.logger.error("Password is too short");
			return ctx.json(null, {
				status: 400,
				body: { message: "Password is too short" },
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
				id: generateRandomString(32, alphabet("a-z", "0-9", "A-Z")),
				userId: session.user.id,
				providerId: "credential",
				accountId: session.user.id,
				password: passwordHash,
			});
			return ctx.json(session.user);
		}
		if (account.password) {
			const verify = await ctx.context.password.verify(
				account.password,
				currentPassword,
			);
			if (!verify) {
				return ctx.json(null, {
					status: 400,
					body: { message: "Invalid password" },
				});
			}
		}
		await ctx.context.internalAdapter.updateAccount(account.id, {
			password: passwordHash,
		});
		if (revokeOtherSessions) {
			await ctx.context.internalAdapter.deleteSessions(session.user.id);
			const newSession = await ctx.context.internalAdapter.createSession(
				session.user.id,
				ctx.request,
			);
			// set the new session cookie
			await setSessionCookie(ctx, newSession.id);
		}
		return ctx.json(session.user);
	},
);
