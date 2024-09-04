import type { Context } from "better-call";
import { createAuthEndpoint } from "../call";
import { getDate } from "../../utils/date";
import { deleteSessionCookie, setSessionCookie } from "../../utils/cookies";

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
			ctx.setHeader("set-cookie", "");
			return ctx.json(null, {
				status: 401,
			});
		}
		const session =
			await ctx.context.internalAdapter.findSession(sessionCookieToken);

		if (!session || session.session.expiresAt < new Date()) {
			deleteSessionCookie(ctx);
			if (session) {
				/**
				 * if session expired clean up the session
				 */
				await ctx.context.internalAdapter.deleteSession(session.session.id);
			}
			return ctx.json(null, {
				status: 401,
			});
		}
		const dontRememberMe = await ctx.getSignedCookie(
			ctx.context.authCookies.dontRememberToken.name,
			ctx.context.secret,
		);
		/**
		 * We don't need to update the session if the user doesn't want to be remembered
		 */
		if (dontRememberMe) {
			return ctx.json(session);
		}
		const expiresIn = ctx.context.session.expiresIn;
		const updateAge = ctx.context.session.updateAge;
		/**
		 * Calculate last updated date to throttle write updates to database
		 * Formula: ({expiry date} - sessionMaxAge) + sessionUpdateAge
		 *
		 * e.g. ({expiry date} - 30 days) + 1 hour
		 *
		 * inspired by: https://github.com/nextauthjs/next-auth/blob/main/packages/core/src/lib/
		 * actions/session.ts
		 */
		const sessionIsDueToBeUpdatedDate =
			session.session.expiresAt.valueOf() - expiresIn * 1000 + updateAge * 1000;

		if (sessionIsDueToBeUpdatedDate <= Date.now()) {
			const updatedSession = await ctx.context.internalAdapter.updateSession(
				session.session.id,
				{
					expiresAt: getDate(ctx.context.session.expiresIn),
				},
			);
			await setSessionCookie(ctx, updatedSession.id, false, {
				maxAge: updatedSession.expiresAt.valueOf() - Date.now(),
			});
			return ctx.json({
				session: updatedSession,
				user: session.user,
			});
		}
		return ctx.json(session);
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
