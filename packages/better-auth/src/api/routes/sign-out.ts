import { createAuthEndpoint } from "@better-auth/core/api";
import { deleteSessionCookie } from "../../cookies";

export const signOut = createAuthEndpoint(
	"/sign-out",
	{
		method: "POST",
		operationId: "signOut",
		requireHeaders: true,
		metadata: {
			openapi: {
				operationId: "signOut",
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
		if (sessionCookieToken) {
			try {
				await ctx.context.internalAdapter.deleteSession(sessionCookieToken);
			} catch (e) {
				ctx.context.logger.error("Failed to delete session from database", e);
			}
		}
		deleteSessionCookie(ctx);
		return ctx.json({
			success: true,
		});
	},
);
