import { type BetterAuthOptions, betterAuth } from "better-auth";
import { D1Dialect } from "kysely-d1";
import type { AppContext } from "../index";

export const baseAuthConfig = {
	advanced: {
		cookies: {
			session_token: {
				name: "better-auth-hono-d1-auth-token",
				attributes: {
					domain: ".example.com",
					secure: true,
					sameSite: "lax",
				},
			},
		},
	},
	appName: "better-auth-hono-d1",
	trustedOrigins: ["https://example.com"],
} as const satisfies Omit<BetterAuthOptions, "database" | "socialProviders">;

export const getAuth = (c: AppContext) => {
	const d1Dialect = new D1Dialect({ database: c.env.D1 });

	return betterAuth({
		...baseAuthConfig,
		database: {
			dialect: d1Dialect,
			type: "sqlite",
		},
		socialProviders: {
			google: {
				clientId: c.env.GOOGLE_ID,
				clientSecret: c.env.GOOGLE_SECRET,
				scope: ["openid", "email", "profile"],
			},
		},
	});
};
