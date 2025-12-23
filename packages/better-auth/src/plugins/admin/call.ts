import { createAuthMiddleware } from "@better-auth/core/api";
import type { Session } from "@better-auth/core/db";
import { APIError, getSessionFromCtx } from "../../api";
import type { UserWithRole } from "./types";

/**
 * Ensures a valid session, if not will throw.
 * Will also provide additional types on the user to include role types.
 */
export const adminMiddleware = createAuthMiddleware(async (ctx) => {
	const session = await getSessionFromCtx(ctx);
	if (!session) {
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
