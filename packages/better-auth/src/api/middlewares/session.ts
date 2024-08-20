import { APIError } from "better-call";
import { createAuthMiddleware } from "../call";
import { getSessionFromCtx } from "../routes";

export const sessionMiddleware = createAuthMiddleware(async (ctx) => {
	const session = await getSessionFromCtx(ctx);
	if (!session?.session) {
		throw new APIError("UNAUTHORIZED");
	}
	return {
		session,
	};
});
