import { createAuthMiddleware, sessionMiddleware } from "../../api";

export const workspaceMiddleware = createAuthMiddleware(async (ctx) => {
	return {
		context: {
			...ctx.context,
		},
	};
});

export const workspaceSessionMiddleware = sessionMiddleware;
