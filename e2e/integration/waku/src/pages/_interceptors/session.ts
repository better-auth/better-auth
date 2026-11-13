import { tryGetContext } from "hono/context-storage";
import type { HandlerInterceptor } from "waku/router/server";
import { getRequest } from "waku/router/server";
import { getSession } from "../../auth";

/**
 * RSC responses stream, so their headers are sent before a component's
 * `getSession()` resolves. Resolving it here, before rendering starts, lets the
 * auth middleware forward any cookies it sets.
 */
const sessionInterceptor: HandlerInterceptor = async (next) => {
	// Static renders at build time have no Hono context, and no session.
	if (!tryGetContext()) return next();
	// Under `/api/auth`, a refreshed session cookie would override sign-out's.
	const { pathname } = new URL(getRequest().url);
	if (pathname.startsWith("/api/")) return next();
	await getSession();
	return next();
};

export default sessionInterceptor;
