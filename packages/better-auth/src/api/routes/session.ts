import type { Context } from "better-call";
import { createAuthEndpoint } from "../call";
import { getDate } from "../../utils/date";
import { deleteSessionCookie, setSessionCookie } from "../../utils/cookies";
import { sessionMiddleware } from "../middlewares/session";
import type { Session, User } from "../../adapters/schema";
import { z } from "zod";
import { getIp } from "../../utils/get-request-ip";

const sessionCache = new Map<
	string,
	{
		data: {
			session: Session;
			user: User;
		};
		expiresAt: number;
	}
>();

/**
 * Generate a unique key for the request to cache the
 * request for 5 seconds for this specific request.
 *
 * This is to prevent reaching to database if getSession is
 * called multiple times for the same request
 */
function getRequestUniqueKey(ctx: Context<any, any>, token: string): string {
	if (!ctx.request) {
		return "";
	}
	const { method, url, headers } = ctx.request;
	const userAgent = ctx.request.headers.get("User-Agent") || "";
	const ip = getIp(ctx.request) || "";
	const headerString = JSON.stringify(headers);
	const uniqueString = `${method}:${url}:${headerString}:${userAgent}:${ip}:${token}`;
	return uniqueString;
}

export const getSession = createAuthEndpoint(
	"/session",
	{
		method: "GET",
		requireHeaders: true,
	},
	async (ctx) => {
		try {
			const sessionCookieToken = await ctx.getSignedCookie(
				ctx.context.authCookies.sessionToken.name,
				ctx.context.secret,
			);

			if (!sessionCookieToken) {
				return ctx.json(null, {
					status: 401,
				});
			}

			const key = getRequestUniqueKey(ctx, sessionCookieToken);
			const cachedSession = sessionCache.get(key);
			if (cachedSession) {
				if (cachedSession.expiresAt > Date.now()) {
					return ctx.json(cachedSession.data);
				}
				sessionCache.delete(key);
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
				session.session.expiresAt.valueOf() -
				expiresIn * 1000 +
				updateAge * 1000;
			const shouldBeUpdated = sessionIsDueToBeUpdatedDate <= Date.now();

			if (shouldBeUpdated) {
				const updatedSession = await ctx.context.internalAdapter.updateSession(
					session.session.id,
					{
						expiresAt: getDate(ctx.context.session.expiresIn, true),
					},
				);
				if (!updatedSession) {
					/**
					 * Handle case where session update fails (e.g., concurrent deletion)
					 */
					deleteSessionCookie(ctx);
					return ctx.json(null, { status: 401 });
				}
				const maxAge = (updatedSession.expiresAt.valueOf() - Date.now()) / 1000;
				await setSessionCookie(ctx, updatedSession.id, false, {
					maxAge,
				});
				return ctx.json({
					session: updatedSession,
					user: session.user,
				});
			}
			sessionCache.set(key, {
				data: session,
				expiresAt: Date.now() + 5000,
			});
			return ctx.json(session);
		} catch (error) {
			ctx.context.logger.error(error);
			return ctx.json(null, { status: 500 });
		}
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

/**
 * user active sessions list
 */
export const listSessions = createAuthEndpoint(
	"/user/list-sessions",
	{
		method: "GET",
		use: [sessionMiddleware],
		requireHeaders: true,
	},
	async (ctx) => {
		const sessions = await ctx.context.adapter.findMany<Session>({
			model: ctx.context.tables.session.tableName,
			where: [
				{
					field: "userId",
					value: ctx.context.session.user.id,
				},
			],
		});
		const activeSessions = sessions.filter((session) => {
			return session.expiresAt > new Date();
		});
		return ctx.json(activeSessions);
	},
);

/**
 * revoke a single session
 */
export const revokeSession = createAuthEndpoint(
	"/user/revoke-session",
	{
		method: "POST",
		body: z.object({
			id: z.string(),
		}),
		use: [sessionMiddleware],
		requireHeaders: true,
	},
	async (ctx) => {
		const id = ctx.body.id;
		console.log(id);
		try {
			await ctx.context.internalAdapter.deleteSession(id);
		} catch (error) {
			ctx.context.logger.error(error);
			return ctx.json(null, { status: 500 });
		}
		return ctx.json({
			status: true,
		});
	},
);
/**
 * revoke all user sessions
 */
export const revokeSessions = createAuthEndpoint(
	"/user/revoke-sessions",
	{
		method: "POST",
		use: [sessionMiddleware],
		requireHeaders: true,
	},
	async (ctx) => {
		try {
			await ctx.context.internalAdapter.deleteSessions(
				ctx.context.session.user.id,
			);
		} catch (error) {
			ctx.context.logger.error(error);
			return ctx.json(null, { status: 500 });
		}
		return ctx.json({
			status: true,
		});
	},
);
