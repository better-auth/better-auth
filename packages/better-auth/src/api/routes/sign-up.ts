import { alphabet, generateRandomString } from "oslo/crypto";
import { z } from "zod";
import { createAuthEndpoint } from "../call";
import { createEmailVerificationToken } from "./verify-email";

export const signUpEmail = createAuthEndpoint(
	"/sign-up/email",
	{
		method: "POST",
		body: z.object({
			name: z.string(),
			email: z.string().email(),
			password: z.string(),
			image: z.string().optional(),
			callbackURL: z.string().optional(),
		}),
	},
	async (ctx) => {
		if (!ctx.context.options.emailAndPassword?.enabled) {
			return ctx.json(null, {
				status: 400,
				body: {
					message: "Email and password is not enabled",
				},
			});
		}
		const { name, email, password, image } = ctx.body;
		const minPasswordLength =
			ctx.context.options?.emailAndPassword?.minPasswordLength || 8;
		if (password.length < minPasswordLength) {
			ctx.context.logger.error("Password is too short");
			return ctx.json(null, {
				status: 400,
				body: { message: "Password is too short" },
			});
		}
		const dbUser = await ctx.context.internalAdapter.findUserByEmail(email);
		/**
		 * hash first to avoid timing attacks
		 */
		const hash = await ctx.context.password.hash(password);
		if (dbUser?.user) {
			return ctx.json(null, {
				status: 400,
				body: {
					message: "User already exists",
				},
			});
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
		await ctx.context.internalAdapter.linkAccount({
			id: generateRandomString(32, alphabet("a-z", "0-9", "A-Z")),
			userId: createdUser.id,
			providerId: "credential",
			accountId: createdUser.id,
			password: hash,
		});
		const session = await ctx.context.internalAdapter.createSession(
			createdUser.id,
			ctx.request,
		);
		await ctx.setSignedCookie(
			ctx.context.authCookies.sessionToken.name,
			session.id,
			ctx.context.secret,
			ctx.context.authCookies.sessionToken.options,
		);
		if (ctx.context.options.emailAndPassword.sendEmailVerificationOnSignUp) {
			const token = await createEmailVerificationToken(
				ctx.context.secret,
				createdUser.email,
			);
			const url = `${ctx.context.baseURL}/verify-email?token=${token}?callbackURL=${ctx.body.callbackURL}`;
			await ctx.context.options.emailAndPassword.sendVerificationEmail?.(
				createdUser.email,
				url,
				token,
			);
		}
		return ctx.json(
			{
				user: createdUser,
				session,
			},
			{
				body: ctx.body.callbackURL
					? {
							url: ctx.body.callbackURL,
							redirect: true,
						}
					: {
							user: createdUser,
							session,
						},
			},
		);
	},
);
