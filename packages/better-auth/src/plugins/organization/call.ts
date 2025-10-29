import type { GenericEndpointContext } from "@better-auth/core";
import { createAuthMiddleware } from "@better-auth/core/api";
import { sessionMiddleware } from "../../api";
import type { Session, User } from "../../types";
import type { Role } from "../access";
import type { defaultRoles } from "./access/statement";
import type { OrganizationOptions } from "./types";

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
