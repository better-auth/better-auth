import { Context } from "better-call";
import { createAuthEndpoint } from "../call";

export const getSession = createAuthEndpoint(
	"/session",
	{
		method: "GET",
		requireHeaders: true,
	},
	async (ctx) => {
		const sessionCookieToken = await ctx.getSignedCookie(
			ctx.context.authCookies.sessionToken.name,
			ctx.context.secret,
		);
		if (!sessionCookieToken) {
			return ctx.json(null, {
				status: 401,
			});
		}
		const session =
			await ctx.context.internalAdapter.findSession(sessionCookieToken);
		if (!session || session.session.expiresAt < new Date()) {
			ctx.setSignedCookie(
				ctx.context.authCookies.sessionToken.name,
				"",
				ctx.context.secret,
				{
					maxAge: 0,
				},
			);
			return ctx.json(null, {
				status: 401,
			});
		}
		const updatedSession = await ctx.context.internalAdapter.updateSession(
			session.session,
		);

		await ctx.setSignedCookie(
			ctx.context.authCookies.sessionToken.name,
			updatedSession.id,
			ctx.context.secret,
			{
				...ctx.context.authCookies.sessionToken.options,
				maxAge: updatedSession.expiresAt.valueOf() - Date.now(),
			},
		);
		return ctx.json({
			session: updatedSession,
			user: session.user,
		});
	},
);

export const getSessionFromCtx = async (ctx: Context<any, any>) => {
	const session = await getSession({
		...ctx,
		//@ts-expect-error: By default since this request context comes from a router it'll have a `router` flag which force it to be a request object
		_flag: undefined,
	});
	return session;
};
