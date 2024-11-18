import Database from "better-sqlite3";
import { createAuthEndpoint, getSessionFromCtx } from "../../api";
import { betterAuth } from "../../auth";
import type { BetterAuthPlugin, Session, User } from "../../types";

export const customSession = <Returns extends Record<string, any>>(
	fn: (session: {
		user: User;
		session: Session;
	}) => Promise<Returns>,
) => {
	return {
		id: "custom-session",
		endpoints: {
			getSession: createAuthEndpoint(
				"/get-session",
				{
					method: "GET",
				},
				async (ctx) => {
					const session = await getSessionFromCtx(ctx);
					if (!session) {
						return ctx.json(null);
					}
					const fnResult = await fn(session);
					return ctx.json({
						...fnResult,
						user: {
							...session.user,
							...((fnResult.user || {}) as {}),
						},
						session: {
							...session.session,
							...((fnResult.session || {}) as {}),
						},
					});
				},
			),
		},
	} satisfies BetterAuthPlugin;
};

const auth = betterAuth({
	database: Database("./"),
	plugins: [
		customSession(async (c) => {
			return {
				user: {
					newField: "new",
				},
			};
		}),
	],
});
