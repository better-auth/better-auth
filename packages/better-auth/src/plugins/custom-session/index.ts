import { createAuthEndpoint, getSessionFromCtx } from "../../api";
import type {
	BetterAuthOptions,
	BetterAuthPlugin,
	InferSession,
	InferUser,
	Session,
	User,
} from "../../types";

export const customSession = <
	Returns extends Record<string, any>,
	O extends BetterAuthOptions = BetterAuthOptions,
>(
	fn: (session: {
		user: InferUser<O>;
		session: InferSession<O>;
	}) => Promise<Returns>,
	options?: O,
) => {
	return {
		id: "custom-session",
		endpoints: {
			getSession: createAuthEndpoint(
				"/get-session",
				{
					method: "GET",
					metadata: {
						CUSTOM_SESSION: true,
					},
				},
				async (ctx) => {
					const session = await getSessionFromCtx(ctx);
					if (!session) {
						return ctx.json(null);
					}
					const fnResult = await fn(session as any);
					return ctx.json(fnResult);
				},
			),
		},
	} satisfies BetterAuthPlugin;
};
