import type { BetterAuthPlugin } from "better-auth";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createAuthMiddleware } from "better-auth/api";
import { applySetCookies } from "better-auth/cookies";
import { getContext } from "hono/context-storage";

const database = {
	user: [],
	session: [],
	account: [],
	verification: [],
};

export const auth = betterAuth({
	baseURL: {
		allowedHosts: ["localhost:*"],
		protocol: "http",
	},
	database: memoryAdapter(database),
	secret: "better-auth-waku-integration-test-secret-x7Kq9mZp",
	emailAndPassword: {
		enabled: true,
	},
	session: {
		cookieCache: {
			enabled: true,
		},
	},
	plugins: [wakuCookies()],
});

type Session = typeof auth.$Infer.Session;

export type AuthEnv = {
	Variables: {
		betterAuthSetCookie: string[];
		sessionPromise?: Promise<Session | null>;
	};
};

function wakuCookies() {
	return {
		id: "waku-cookies",
		hooks: {
			after: [
				{
					matcher: () => true,
					handler: createAuthMiddleware(async (ctx) => {
						// Requests to the auth handler set cookies on their own response
						if ("_flag" in ctx && ctx._flag === "router") return;
						const setCookies =
							ctx.context.responseHeaders?.getSetCookie() ?? [];
						if (!setCookies.length) return;
						const c = getContext<AuthEnv>();
						// One request can make several auth calls
						c.set("betterAuthSetCookie", [
							...c.var.betterAuthSetCookie,
							...setCookies,
						]);
						// The cookies changed, so the next read fetches the session again
						c.set("sessionPromise", undefined);
					}),
				},
			],
		},
	} satisfies BetterAuthPlugin;
}

/**
 * Returns the current session, fetched once per request until cookies change.
 * Cookies set earlier in the request take precedence over the incoming ones.
 */
export function getSession() {
	const c = getContext<AuthEnv>();
	if (c.var.sessionPromise) return c.var.sessionPromise;
	const headers = new Headers(c.req.raw.headers);
	applySetCookies(headers, c.var.betterAuthSetCookie);
	const sessionPromise = auth.api.getSession({ headers });
	c.set("sessionPromise", sessionPromise);
	return sessionPromise;
}
