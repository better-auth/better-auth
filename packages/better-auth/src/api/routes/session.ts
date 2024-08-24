import { Context } from "better-call";
import { createAuthEndpoint } from "../call";
import { HIDE_ON_CLIENT_METADATA } from "../../client/client-utils";

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
			ctx.setCookie(ctx.context.authCookies.sessionToken.name, "", {
				maxAge: 0,
			});
			return ctx.json(null, {
				status: 401,
			});
		}
		const updatedSession = await ctx.context.internalAdapter.updateSession(
			session.session,
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
