import { z } from "zod";
import { createAuthEndpoint } from "../../api/call";
import type { BetterAuthPlugin } from "../../types/plugins";
import { APIError } from "better-call";
import type { Account, User } from "../../db/schema";
import { sessionMiddleware } from "../../api";

interface UsernameOptions {
	rateLimit?: {
		signIn?: {
			window: number;
			max: number;
		};
		update?: {
			window: number;
			max: number;
		};
	};
}

export const username = (options?: UsernameOptions) => {
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
					}),
				},
				async (ctx) => {
					const user = await ctx.context.adapter.findOne<User>({
						model: ctx.context.tables.user.tableName,
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
						model: ctx.context.tables.account.tableName,
						where: [
							{
								field:
									ctx.context.tables.account.fields.userId.fieldName ||
									"userId",
								value: user.id,
							},
							{
								field:
									ctx.context.tables.account.fields.providerId.fieldName ||
									"providerId",
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
					});
				},
			),
			updateUsername: createAuthEndpoint(
				"/update-username",
				{
					method: "POST",
					body: z.object({
						username: z.string(),
					}),
					use: [sessionMiddleware],
				},
				async (ctx) => {
					const user = ctx.context.session.user;
					const updatedUser = await ctx.context.internalAdapter.updateUser(
						user.id,
						{
							username: ctx.body.username,
						},
					);
					return ctx.json({
						user: updatedUser,
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
		rateLimit: [
			{
				pathMatcher(path) {
					return path === "/sign-in/username";
				},
				window: options?.rateLimit?.signIn?.window || 10,
				max: options?.rateLimit?.signIn?.max || 3,
			},
			{
				pathMatcher(path) {
					return path === "/update-username";
				},
				window: options?.rateLimit?.update?.window || 10,
				max: options?.rateLimit?.update?.max || 3,
			},
		],
	} satisfies BetterAuthPlugin;
};
