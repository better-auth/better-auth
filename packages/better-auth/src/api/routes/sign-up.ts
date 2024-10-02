import { alphabet, generateRandomString } from "../../crypto/random";
import { z } from "zod";
import { createAuthEndpoint } from "../call";
import { createEmailVerificationToken } from "./verify-email";
import { setSessionCookie } from "../../utils";

export const signUpEmail = createAuthEndpoint(
	"/sign-up/email",
	{
		method: "POST",
		query: z
			.object({
				currentURL: z.string().optional(),
			})
			.optional(),
		body: z.object({
			name: z.string(),
			email: z.string(),
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
		const isValidEmail = z.string().email().safeParse(email);
		if (!isValidEmail.success) {
			return ctx.json(null, {
				status: 400,
				body: {
					message: "Invalid email address",
				},
			});
		}

		const minPasswordLength = ctx.context.password.config.minPasswordLength;
		if (password.length < minPasswordLength) {
			ctx.context.logger.error("Password is too short");
			return ctx.json(null, {
				status: 400,
				body: { message: "Password is too short" },
			});
		}
		const maxPasswordLength = ctx.context.password.config.maxPasswordLength;
		if (password.length > maxPasswordLength) {
			ctx.context.logger.error("Password is too long");
			return ctx.json(null, {
				status: 400,
				body: { message: "Password is too long" },
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
		if (!createdUser) {
			return ctx.json(null, {
				status: 400,
				body: {
					message: "Could not create user",
				},
			});
		}
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
		if (!session) {
			return ctx.json(null, {
				status: 400,
				body: {
					message: "Could not create session",
				},
			});
		}
		await setSessionCookie(ctx, session.id);
		if (ctx.context.options.emailAndPassword.sendEmailVerificationOnSignUp) {
			const token = await createEmailVerificationToken(
				ctx.context.secret,
				createdUser.email,
			);
			const url = `${
				ctx.context.baseURL
			}/verify-email?token=${token}&callbackURL=${
				ctx.body.callbackURL || ctx.query?.currentURL || "/"
			}`;
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
