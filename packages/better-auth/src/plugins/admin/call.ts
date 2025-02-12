import { type UserWithRole } from ".";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "../../api";
import { type Session } from "../../types";
import { type defaultRoles, type Role } from "./access";

export const adminMiddleware = createAuthMiddleware(async (ctx) => {
	const session = await getSessionFromCtx(ctx);
	if (!session?.session) {
		throw new APIError("UNAUTHORIZED");
	}
	const user = session.user as UserWithRole;

	return {
		session: {
			user: user,
			session: session.session,
		},
	} as {
		session: {
			user: UserWithRole;
			session: Session;
		};
		roles: typeof defaultRoles & {
			[key: string]: Role<{}>;
		};
	};
});