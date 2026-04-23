import type { GenericEndpointContext } from "@better-auth/core";
import { createAuthMiddleware } from "@better-auth/core/api";
import { sessionMiddleware } from "../../api/index.js";
import type { Session, User } from "../../types/index.js";
import type { Role } from "../access/index.js";
import type { defaultRoles } from "./access/statement.js";
import type { OrganizationOptions } from "./types.js";

export const orgMiddleware = createAuthMiddleware(async () => {
	return {} as {
		orgOptions: OrganizationOptions;
		roles: typeof defaultRoles & {
			[key: string]: Role<{}>;
		};
		getSession: (context: GenericEndpointContext) => Promise<{
			session: Session & {
				activeTeamId?: string | undefined;
				activeOrganizationId?: string | undefined;
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
