//@ts-nocheck
import { createAuthEndpoint, originCheck} from "./index";
import { z } from "zod";

export const magicLinkVerify = createAuthEndpoint(
	"/magic-link/verify",
	{
		method: "GET",
		query: z.object({
			token: z.string({
				description: "Verification token. Eg: \"123456\"",
			}),
			callbackURL: z
				.string({
					description:
						"URL to redirect after magic link verification, if not provided the user will be redirected to the root URL. Eg: \"/dashboard\"",
				})
				.optional(),
		}),
		use: [originCheck((ctx) => ctx.query.callbackURL)],
		requireHeaders: true,
		metadata: {
			openapi: {
				description: "Verify magic link",
				responses: {
					200: {
						description: "Success",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										session: {
											$ref: "#/components/schemas/Session",
										},
										user: {
											$ref: "#/components/schemas/User",
										},
									},
								},
							},
						},
					},
				},
			},
		},
	},
	async (ctx) => {
		const { token, callbackURL } = ctx.query;
		const toRedirectTo = callbackURL?.startsWith("http")
			? callbackURL
			: callbackURL
				? `${ctx.context.options.baseURL}${callbackURL}`
				: ctx.context.options.baseURL;
		const tokenValue =
			await ctx.context.internalAdapter.findVerificationValue(token);
		if (!tokenValue) {
			throw ctx.redirect(`${toRedirectTo}?error=INVALID_TOKEN`);
		}
		if (tokenValue.expiresAt < new Date()) {
			await ctx.context.internalAdapter.deleteVerificationValue(
				tokenValue.id,
			);
			throw ctx.redirect(`${toRedirectTo}?error=EXPIRED_TOKEN`);
		}
		await ctx.context.internalAdapter.deleteVerificationValue(
			tokenValue.id,
		);
		const { email, name } = JSON.parse(tokenValue.value) as {
			email: string;
			name?: string;
		};
		let user = await ctx.context.internalAdapter
			.findUserByEmail(email)
			.then((res) => res?.user);

		if (!user) {
			if (!options.disableSignUp) {
				const newUser = await ctx.context.internalAdapter.createUser(
					{
						email: email,
						emailVerified: true,
						name: name || "",
					},
					ctx,
				);
				user = newUser;
				if (!user) {
					throw ctx.redirect(
						`${toRedirectTo}?error=failed_to_create_user`,
					);
				}
			} else {
				throw ctx.redirect(`${toRedirectTo}?error=failed_to_create_user`);
			}
		}

		if (!user.emailVerified) {
			await ctx.context.internalAdapter.updateUser(
				user.id,
				{
					emailVerified: true,
				},
				ctx,
			);
		}

		const session = await ctx.context.internalAdapter.createSession(
			user.id,
			ctx,
		);

		if (!session) {
			throw ctx.redirect(
				`${toRedirectTo}?error=failed_to_create_session`,
			);
		}

		await setSessionCookie(ctx, {
			session,
			user,
		});
		if (!callbackURL) {
			return ctx.json({
				token: session.token,
				user: {
					id: user.id,
					email: user.email,
					emailVerified: user.emailVerified,
					name: user.name,
					image: user.image,
					createdAt: user.createdAt,
					updatedAt: user.updatedAt,
				},
			});
		}
		throw ctx.redirect(callbackURL);
	},
)