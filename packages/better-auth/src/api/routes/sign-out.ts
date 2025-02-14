import { createAuthEndpoint } from "../call";
import { deleteSessionCookie } from "../../cookies";
import { APIError } from "better-call";
import { BASE_ERROR_CODES } from "../../error/codes";

export const signOut = createAuthEndpoint(
	"/sign-out",
	{
		method: "POST",
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
		});
	},
);
