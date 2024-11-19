import { z } from "zod";
import { createAuthEndpoint } from "../../api/call";
import type { BetterAuthPlugin } from "../../types/plugins";
import { APIError } from "better-call";
import type { Account, User } from "../../db/schema";
import { setSessionCookie } from "../../cookies";

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
						rememberMe: z.boolean().optional(),
					}),
				},
				async (ctx) => {
					const user = await ctx.context.adapter.findOne<User>({
						model: ctx.context.tables.user.modelName,
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
						ctx.body.rememberMe === false,
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
					await setSessionCookie(
						ctx,
						{ session, user },
						ctx.body.rememberMe === false,
					);
					return ctx.json({
						user: user,
						session,
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
