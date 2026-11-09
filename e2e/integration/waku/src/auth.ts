import type { BetterAuthPlugin } from "better-auth";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createAuthMiddleware } from "better-auth/api";
import { getContext } from "hono/context-storage";

const database = {
	user: [],
	session: [],
	account: [],
	verification: [],
};

type AuthEnv = {
	Variables: {
		betterAuthSetCookie?: string[];
		sessionPromise?: ReturnType<typeof auth.api.getSession>;
	};
};

function wakuCookies() {
	return {
		id: "waku-cookies",
		hooks: {
			after: [
				{
					matcher() {
						return true;
					},
					handler: createAuthMiddleware(async (ctx) => {
						const returned = ctx.context.responseHeaders;
						if ("_flag" in ctx && ctx._flag === "router") {
							return;
						}
						if (returned instanceof Headers) {
							const setCookies = returned.getSetCookie();
							if (!setCookies.length) return;
							const c = getContext<AuthEnv>();
							// One request can make several auth calls
							c.set("betterAuthSetCookie", [
								...(c.get("betterAuthSetCookie") ?? []),
								...setCookies,
							]);
						}
					}),
				},
			],
		},
	} satisfies BetterAuthPlugin;
}

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

export function getSession() {
	const c = getContext<AuthEnv>();
	const existing = c.get("sessionPromise");
	if (existing) return existing;
	const sessionPromise = auth.api.getSession({ headers: c.req.raw.headers });
	c.set("sessionPromise", sessionPromise);
	return sessionPromise;
}

export function getBetterAuthSetCookie() {
	return getContext<AuthEnv>().get("betterAuthSetCookie");
}
