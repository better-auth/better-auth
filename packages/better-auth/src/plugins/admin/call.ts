import { type UserWithRole } from "./admin";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "../../api";
import { type Session } from "../../types";

export const adminMiddleware = createAuthMiddleware(async (ctx) => {
	const session = await getSessionFromCtx(ctx);
	if (!session?.session) {
		throw new APIError("UNAUTHORIZED");
	}
	return {
		session,
	} as {
		session: {
			user: UserWithRole;
			session: Session;
		};
	};
});
