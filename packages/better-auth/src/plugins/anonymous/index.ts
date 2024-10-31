import { createAuthEndpoint, sessionMiddleware } from "../../api";
import type { BetterAuthPlugin } from "../../types";
import { setSessionCookie } from "../../cookies";
import { z } from "zod";
import { generateId } from "../../utils/id";
import { getOrigin } from "../../utils/url";

export interface AnonymousOptions {
	/**
	 * Configure the domain name of the temporary email
	 * address for anonymous users in the database.
	 * @default "baseURL"
	 */
	emailDomainName?: string;
}

export const anonymous = (options?: AnonymousOptions) => {
	return {
		id: "anonymous",
		endpoints: {
			signInAnonymous: createAuthEndpoint(
				"/sign-in/anonymous",
				{
					method: "POST",
				},
				async (ctx) => {
					const { emailDomainName = getOrigin(ctx.context.baseURL) } =
						options || {};
					const id = generateId();
					const email = `temp-${id}@${emailDomainName}`;
					const newUser = await ctx.context.internalAdapter.createUser({
						id,
						email,
						emailVerified: false,
						isAnonymous: true,
						name: "Anonymous",
						createdAt: new Date(),
						updatedAt: new Date(),
					});
					if (!newUser) {
						return ctx.json(null, {
							status: 500,
							body: {
								message: "Failed to create user",
								status: 500,
							},
						});
					}
					const session = await ctx.context.internalAdapter.createSession(
						newUser.id,
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
					await setSessionCookie(ctx, {
						session,
						user: newUser,
					});
					return ctx.json({ user: newUser, session });
				},
			),
			linkAccount: createAuthEndpoint(
				"/anonymous/link-account",
				{
					method: "POST",
					body: z.object({
						email: z.string().email().optional(),
						password: z.string().min(6),
					}),
					use: [sessionMiddleware],
				},
				async (ctx) => {
					const userId = ctx.context.session.user.id;
					const { email, password } = ctx.body;
					let updatedUser = null;
					if (email && password) {
						updatedUser = await ctx.context.internalAdapter.updateUser(userId, {
							email: email,
							isAnonymous: false,
						});
					}
					if (!updatedUser) {
						return ctx.json(null, {
							status: 500,
							body: {
								message: "Failed to update user",
								status: 500,
							},
						});
					}
					const hash = await ctx.context.password.hash(password);
					const updateUserAccount =
						await ctx.context.internalAdapter.linkAccount({
							userId: updatedUser.id,
							providerId: "credential",
							password: hash,
							accountId: updatedUser.id,
						});
					if (!updateUserAccount) {
						return ctx.json(null, {
							status: 500,
							body: {
								message: "Failed to update account",
								status: 500,
							},
						});
					}
					const session = await ctx.context.internalAdapter.createSession(
						updatedUser.id,
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
					await setSessionCookie(ctx, {
						session,
						user: updatedUser,
					});
					return ctx.json({ session, user: updatedUser });
				},
			),
		},
		schema: {
			user: {
				fields: {
					isAnonymous: {
						type: "boolean",
						defaultValue: true,
						required: false,
					},
				},
			},
		},
	} satisfies BetterAuthPlugin;
};
