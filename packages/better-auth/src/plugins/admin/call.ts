import { type UserWithRole } from "./admin";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "../../api";
import { type Session } from "../../types";
import { type Role } from "../access";
import { type defaultRoles } from "./access/statement";

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
		roles: typeof defaultRoles & {
			[key: string]: Role<{}>;
		};
	};
});
