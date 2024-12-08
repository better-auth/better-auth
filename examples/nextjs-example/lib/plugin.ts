import { BetterAuthPlugin } from "better-auth";

export const addAccountToSession = {
	id: "add-account-to-session",
	hooks: {
		after: [
			{
				matcher(context) {
					return context.path.startsWith("/callback");
				},
				async handler(ctx) {
					const sessionCookie = ctx.responseHeader.get(
						ctx.context.authCookies.sessionToken.name,
					);
					if (!sessionCookie) {
						return;
					}
					const provider = ctx.path.split("/callback")[1];
					if (!provider) {
						return;
					}
					const sessionId = sessionCookie.split(".")[0];
					await ctx.context.internalAdapter.updateSession(sessionId, {
						accountId: provider,
					});
				},
			},
		],
	},
	schema: {
		session: {
			fields: {
				accountId: {
					type: "string",
					required: false,
				},
			},
		},
	},
} satisfies BetterAuthPlugin;
