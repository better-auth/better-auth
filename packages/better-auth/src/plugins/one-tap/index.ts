import { z } from "zod";
import { APIError, createAuthEndpoint } from "../../api";
import { setSessionCookie } from "../../cookies";
import type { BetterAuthPlugin } from "../../types";
import { betterFetch } from "@better-fetch/fetch";
import { toBoolean } from "../../utils/boolean";

interface OneTapOptions {
	/**
	 * Disable the signup flow
	 *
	 * @default false
	 */
	disableSignup?: boolean;
}

export const oneTap = (options?: OneTapOptions) =>
	({
		id: "one-tap",
		endpoints: {
			oneTapCallback: createAuthEndpoint(
				"/one-tap/callback",
				{
					method: "POST",
					body: z.object({
						idToken: z.string({
							description:
								"Google ID token, which the client obtains from the One Tap API",
						}),
					}),
					metadata: {
						openapi: {
							summary: "One tap callback",
							description:
								"Use this endpoint to authenticate with Google One Tap",
							responses: {
								200: {
									description: "Successful response",
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
								400: {
									description: "Invalid token",
								},
							},
						},
					},
				},
				async (ctx) => {
					const { idToken } = ctx.body;
					const { data, error } = await betterFetch<{
						email: string;
						email_verified: string;
						name: string;
						picture: string;
						sub: string;
					}>("https://oauth2.googleapis.com/tokeninfo?id_token=" + idToken);
					if (error) {
						return ctx.json({
							error: "Invalid token",
						});
					}
					const user = await ctx.context.internalAdapter.findUserByEmail(
						data.email,
					);
					if (!user) {
						if (options?.disableSignup) {
							throw new APIError("BAD_GATEWAY", {
								message: "User not found",
							});
						}
						const user = await ctx.context.internalAdapter.createOAuthUser(
							{
								email: data.email,
								emailVerified: toBoolean(data.email_verified),
								name: data.name,
								image: data.picture,
							},
							{
								providerId: "google",
								accountId: data.sub,
							},
							ctx
						);
						if (!user) {
							throw new APIError("INTERNAL_SERVER_ERROR", {
								message: "Could not create user",
							});
						}
						const session = await ctx.context.internalAdapter.createSession(
							user?.user.id,
							ctx.request,
						);
						await setSessionCookie(ctx, {
							user: user.user,
							session,
						});
						return ctx.json({
							token: session.token,
							user: {
								id: user.user.id,
								email: user.user.email,
								emailVerified: user.user.emailVerified,
								name: user.user.name,
								image: user.user.image,
								createdAt: user.user.createdAt,
								updatedAt: user.user.updatedAt,
							},
						});
					}
					const session = await ctx.context.internalAdapter.createSession(
						user.user.id,
						ctx.request,
					);

					await setSessionCookie(ctx, {
						user: user.user,
						session,
					});
					return ctx.json({
						token: session.token,
						user: {
							id: user.user.id,
							email: user.user.email,
							emailVerified: user.user.emailVerified,
							name: user.user.name,
							image: user.user.image,
							createdAt: user.user.createdAt,
							updatedAt: user.user.updatedAt,
						},
					});
				},
			),
		},
	}) satisfies BetterAuthPlugin;
