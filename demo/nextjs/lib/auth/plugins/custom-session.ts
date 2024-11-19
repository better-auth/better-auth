import { BetterAuthPlugin } from "better-auth";
import { createAuthEndpoint } from "better-auth/plugins";
import { getSessionFromCtx } from "better-auth/api";

export const customSession = () => {
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
					const roles: {
						id: number;
						name: string;
					}[] = [];
					return ctx.json({
						user: session.user,
						session: session.session,
						roles,
					});
				},
			),
		},
	} satisfies BetterAuthPlugin;
};
