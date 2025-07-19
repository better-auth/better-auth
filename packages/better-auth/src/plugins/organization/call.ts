import type { GenericEndpointContext, Session, User } from "../../types";
import { createAuthMiddleware } from "../../api/call";
import { sessionMiddleware } from "../../api";
import type { Role } from "../access";
import type { OrganizationOptions } from "./types";
import type { defaultRoles } from "./access/statement";

export const orgMiddleware = createAuthMiddleware(async () => {
	return {} as {
		orgOptions: OrganizationOptions;
		roles: typeof defaultRoles & {
			[key: string]: Role<{}>;
		};
		getSession: (context: GenericEndpointContext) => Promise<{
			session: Session & {
				activeTeamId?: string;
				activeOrganizationId?: string;
			};
			user: User;
		}>;
	};
});

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
				activeTeamId?: string;
				activeOrganizationId?: string;
			};
			user: User;
		};
		return {
			session,
		};
	},
);
