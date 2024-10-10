import { z } from "zod";
import { createAuthEndpoint } from "../../api/call";
import type { BetterAuthPlugin } from "../../types/plugins";
import { APIError } from "better-call";
import type { Account, User } from "../../db/schema";
import { signUpEmail } from "../../api/routes/sign-up";

export const username = () => {
	return {
		id: "username",
		endpoints: {
			signInUsername: createAuthEndpoint(
				"/sign-in/username",
				{
					method: "POST",
					body: z.object({
						username: z.string(),
						password: z.string(),
						dontRememberMe: z.boolean().optional(),
						callbackURL: z.string().optional(),
					}),
				},
				async (ctx) => {
					const user = await ctx.context.adapter.findOne<User>({
						model: "user",
						where: [
							{
								field: "username",
								value: ctx.body.username,
							},
						],
					});
					if (!user) {
						await ctx.context.password.hash(ctx.body.password);
						ctx.context.logger.error("User not found", { username });
						throw new APIError("UNAUTHORIZED", {
							message: "Invalid username or password",
						});
					}
					const account = await ctx.context.adapter.findOne<Account>({
						model: "account",
						where: [
							{
								field: "userId",
								value: user.id,
							},
							{
								field: "providerId",
								value: "credential",
							},
						],
					});
					if (!account) {
						throw new APIError("UNAUTHORIZED", {
							message: "Invalid username or password",
						});
					}
					const currentPassword = account?.password;
					if (!currentPassword) {
						ctx.context.logger.error("Password not found", { username });
						throw new APIError("UNAUTHORIZED", {
							message: "Unexpected error",
						});
					}
					const validPassword = await ctx.context.password.verify(
						currentPassword,
						ctx.body.password,
					);
					if (!validPassword) {
						ctx.context.logger.error("Invalid password");
						throw new APIError("UNAUTHORIZED", {
							message: "Invalid username or password",
						});
					}
					const session = await ctx.context.internalAdapter.createSession(
						user.id,
						ctx.request,
					);
					if (!session) {
						return ctx.json(null, {
							status: 500,
							body: {
								message: "Failed to create session",
								status: 500,
							},
						});
					}
					await ctx.setSignedCookie(
						ctx.context.authCookies.sessionToken.name,
						session.id,
						ctx.context.secret,
						ctx.body.dontRememberMe
							? {
									...ctx.context.authCookies.sessionToken.options,
									maxAge: undefined,
								}
							: ctx.context.authCookies.sessionToken.options,
					);
					return ctx.json({
						user: user,
						session,
						redirect: !!ctx.body.callbackURL,
						url: ctx.body.callbackURL,
					});
				},
			),
			signUpUsername: createAuthEndpoint(
				"/sign-up/username",
				{
					method: "POST",
					body: z.object({
						username: z.string().min(3).max(20),
						name: z.string(),
						email: z.string().email(),
						password: z.string(),
						image: z.string().optional(),
						callbackURL: z.string().optional(),
					}),
				},
				async (ctx) => {
					const res = await signUpEmail()({
						...ctx,
						_flag: "json",
					});
					if (res.error) {
						return ctx.json(null, {
							status: 400,
							body: {
								message: res.error,
								status: 400,
							},
						});
					}
					const updated = await ctx.context.internalAdapter.updateUserByEmail(
						res.user?.email,
						{
							username: ctx.body.username,
						},
					);
					if (ctx.body.callbackURL) {
						return ctx.json(
							{
								user: updated,
								session: res.session,
							},
							{
								body: {
									url: ctx.body.callbackURL,
									redirect: true,
									...res,
								},
							},
						);
					}
					return ctx.json({
						user: updated,
						session: res.session,
					});
				},
			),
		},

		schema: {
			user: {
				fields: {
					username: {
						type: "string",
						required: false,
						unique: true,
						returned: true,
					},
				},
			},
		},
	} satisfies BetterAuthPlugin;
};
