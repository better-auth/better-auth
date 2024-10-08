import { alphabet, generateRandomString } from "../../crypto/random";
import { z, ZodOptional } from "zod";
import { createAuthEndpoint } from "../call";
import { createEmailVerificationToken } from "./verify-email";
import { setSessionCookie } from "../../utils/cookies";
import { APIError } from "better-call";
import type {
	AdditionalUserFieldsInput,
	BetterAuthOptions,
	HasRequiredKeys,
	InferUser,
} from "../../types";
import type { toZod } from "../../types/to-zod";
import { parseUserInput } from "../../db/schema";

export const signUpEmail = <O extends BetterAuthOptions>() =>
	createAuthEndpoint(
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
				additionalFields: z
					.record(z.string(), z.any())
					.optional() as unknown as HasRequiredKeys<
					AdditionalUserFieldsInput<O>
				> extends true
					? toZod<AdditionalUserFieldsInput<O>>
					: ZodOptional<toZod<AdditionalUserFieldsInput<O>>>,
			}),
		},
		async (ctx) => {
			if (!ctx.context.options.emailAndPassword?.enabled) {
				throw new APIError("BAD_REQUEST", {
					message: "Email and password sign up is not enabled",
				});
			}
			const { name, email, password, image } = ctx.body;
			const additionalFields = ctx.body.additionalFields;
			const isValidEmail = z.string().email().safeParse(email);

			if (!isValidEmail.success) {
				throw new APIError("BAD_REQUEST", {
					message: "Invalid email",
				});
			}

			const minPasswordLength = ctx.context.password.config.minPasswordLength;
			if (password.length < minPasswordLength) {
				ctx.context.logger.error("Password is too short");
				throw new APIError("BAD_REQUEST", {
					message: "Password is too short",
				});
			}
			const maxPasswordLength = ctx.context.password.config.maxPasswordLength;
			if (password.length > maxPasswordLength) {
				ctx.context.logger.error("Password is too long");
				throw new APIError("BAD_REQUEST", {
					message: "Password is too long",
				});
			}
			const dbUser = await ctx.context.internalAdapter.findUserByEmail(email);
			if (dbUser?.user) {
				throw new APIError("BAD_REQUEST", {
					message: "User already exists",
				});
			}

			const additionalData = parseUserInput(
				ctx.context.options,
				additionalFields as any,
			);
			const createdUser = await ctx.context.internalAdapter.createUser({
				id: generateRandomString(32, alphabet("a-z", "0-9", "A-Z")),
				email: email.toLowerCase(),
				name,
				image,
				emailVerified: false,
				createdAt: new Date(),
				updatedAt: new Date(),
				...additionalData,
			});
			if (!createdUser) {
				throw new APIError("BAD_REQUEST", {
					message: "Couldn't create user",
				});
			}
			/**
			 * Link the account to the user
			 */
			const hash = await ctx.context.password.hash(password);
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
				throw new APIError("BAD_REQUEST", {
					message: "Couldn't create session",
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
					error: null,
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
