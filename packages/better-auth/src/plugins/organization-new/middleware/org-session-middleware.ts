import { createAuthMiddleware } from "@better-auth/core/api";
import type { Session, User } from "@better-auth/core/db";
import { sessionMiddleware } from "../../../api";

/**
 * The middleware forces the endpoint to require a valid session by utilizing the `sessionMiddleware`.
 * It also appends additional types to the session type regarding organizations.
 */
export const orgSessionMiddleware = createAuthMiddleware(
	{
		use: [sessionMiddleware],
	},
	async (ctx) => {
		const session = ctx.context.session as {
			session: Session & {
				activeTeamId?: string | undefined;
				activeOrganizationId?: string | undefined;
			};
			user: User;
		};
		return {
			session,
		};
	},
);
