import type { GenericEndpointContext, Session, User } from "../../types";
import { createAuthMiddleware } from "../../api/call";
import { sessionMiddleware } from "../../api";
import type { Role } from "../access";
import type { OrganizationOptions } from "./types";
import type { defaultRoles } from "./access/statement";

export const orgMiddleware = createAuthMiddleware(async (ctx) => {
	return {} as {
		orgOptions: OrganizationOptions;
		roles: typeof defaultRoles & {
			[key: string]: Role<{}>;
		};
		getSession: (context: GenericEndpointContext) => Promise<{
			session: Session & {
				activeOrganizationId?: string;
			};
			user: User;
		}>;
	};
});

export const orgSessionMiddleware = createAuthMiddleware(
	{
		use: [sessionMiddleware],
	},
	async (ctx) => {
		const session = ctx.context.session as {
			session: Session & {
				activeOrganizationId?: string;
			};
			user: User;
		};
		return {
			session,
		};
	},
);
