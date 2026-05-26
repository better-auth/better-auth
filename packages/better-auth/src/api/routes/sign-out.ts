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
		let userId: string | undefined;
		let sessionDeleted = false;
		if (sessionCookieToken) {
			if (ctx.context.options.onLogout) {
				try {
					const session =
						await ctx.context.internalAdapter.findSession(sessionCookieToken);
					if (session) {
						userId = session.session.userId;
					}
				} catch (e) {
					ctx.context.logger.error("Failed to find session before logout", e);
				}
			}
			try {
				await ctx.context.internalAdapter.deleteSession(sessionCookieToken);
				sessionDeleted = true;
			} catch (e) {
				ctx.context.logger.error("Failed to delete session from database", e);
			}
		}
		deleteSessionCookie(ctx);
		if (userId && sessionDeleted && ctx.context.options.onLogout) {
			await ctx.context.runInBackgroundOrAwait(
				ctx.context.options.onLogout({ userId }, ctx.request),
			);
		}
		return ctx.json({
			success: true,
		});
	},
);
