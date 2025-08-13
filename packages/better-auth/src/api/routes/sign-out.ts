import { createAuthEndpoint } from "../call";
import { deleteSessionCookie } from "../../cookies";
import { APIError } from "better-call";
import { z } from "zod";
import { BASE_ERROR_CODES } from "../../error/codes";

export const signOut = createAuthEndpoint(
	"/sign-out",
	{
		method: "POST",
		body: z.object({
			/**
			 * Callback URL to use as a redirect after sign-out
			 */
			callbackURL: z
				.string({
					description: "Callback URL to use as a redirect after sign-out",
				})
				.optional(),
		}),
		requireHeaders: true,
		metadata: {
			openapi: {
				description: "Sign out the current user",
				responses: {
					"200": {
						description: "Success",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										success: {
											type: "boolean",
										},
										redirect: {
											type: "boolean",
										},
										url: {
											type: "string",
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
		const sessionCookieToken = await ctx.getSignedCookie(
			ctx.context.authCookies.sessionToken.name,
			ctx.context.secret,
		);
		if (!sessionCookieToken) {
			deleteSessionCookie(ctx);
			throw new APIError("BAD_REQUEST", {
				message: BASE_ERROR_CODES.FAILED_TO_GET_SESSION,
			});
		}
		await ctx.context.internalAdapter.deleteSession(sessionCookieToken);
		deleteSessionCookie(ctx);
		return ctx.json({
			success: true,
			redirect: !!ctx.body.callbackURL,
			url: ctx.body.callbackURL,
		});
	},
);
