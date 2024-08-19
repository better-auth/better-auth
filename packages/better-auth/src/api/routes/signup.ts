import { z } from "zod";
import { createAuthEndpoint } from "../call";
import { alphabet, generateRandomString } from "oslo/crypto";
import { Argon2id } from "oslo/password";

export const signUpCredential = createAuthEndpoint(
	"/sign-up/credential",
	{
		method: "POST",
		body: z.object({
			name: z.string(),
			email: z.string().email(),
			password: z.string(),
			image: z.string().optional(),
		}),
	},
	async (ctx) => {
		if (!ctx.context.options.emailAndPassword?.enabled) {
			return ctx.json(
				{
					message: "Email and password is not enabled",
				},
				{
					status: 400,
				},
			);
		}
		const { name, email, password, image } = ctx.body;
		const minPasswordLength =
			ctx.context.options?.emailAndPassword?.minPasswordLength || 8;
		if (password.length < minPasswordLength) {
			ctx.context.logger.error("Password is too short");
			return ctx.json(
				{ message: "Password is too short" },
				{
					status: 400,
				},
			);
		}
		const dbUser = await ctx.context.internalAdapter.findUserByEmail(email);
		if (dbUser?.user) {
			const isLinked = dbUser.accounts.find(
				(a) => a.providerId === "credential",
			);
			if (isLinked) {
				const session = await ctx.context.internalAdapter.createSession(
					dbUser.user.id,
				);
				await ctx.setSignedCookie(
					ctx.context.authCookies.sessionToken.name,
					session.id,
					ctx.context.options.secret,
					ctx.context.authCookies.sessionToken.options,
				);
				return ctx.json({
					user: dbUser.user,
					session,
				});
			}
			return ctx.json(
				{
					message: "User already exists",
				},
				{
					status: 400,
				},
			);
		}
		const createdUser = await ctx.context.internalAdapter.createUser({
			id: generateRandomString(32, alphabet("a-z", "0-9", "A-Z")),
			email: email.toLowerCase(),
			name,
			image,
			emailVerified: false,
			createdAt: new Date(),
			updatedAt: new Date(),
		});
		/**
		 * Link the account to the user
		 */
		const argon2id = new Argon2id();
		const hash = await argon2id.hash(password);
		await ctx.context.internalAdapter.linkAccount({
			id: generateRandomString(32, alphabet("a-z", "0-9", "A-Z")),
			userId: createdUser.id,
			providerId: "credential",
			accountId: createdUser.id,
			password: hash,
		});
		const session = await ctx.context.internalAdapter.createSession(
			createdUser.id,
		);
		await ctx.setSignedCookie(
			ctx.context.authCookies.sessionToken.name,
			session.id,
			ctx.context.options.secret,
			ctx.context.authCookies.sessionToken.options,
		);
		return ctx.json({
			user: createdUser,
			session,
		});
	},
);
