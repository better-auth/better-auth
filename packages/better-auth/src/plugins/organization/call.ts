import type { GenericEndpointContext, Session, User } from "../../types";
import { createAuthMiddleware } from "../../api/call";
import { sessionMiddleware } from "../../api";
import type { Role } from "../access";
import type { OrganizationOptions } from "./types";
import type { defaultRoles } from "./access/statement";

type TeamSession<O extends OrganizationOptions> = O["teams"] extends {
	enabled: true;
}
	? {
			activeTeamId?: string;
		}
	: {};

export const orgMiddleware = <O extends OrganizationOptions>() =>
	createAuthMiddleware(async () => {
		return {} as {
			orgOptions: O;
			roles: typeof defaultRoles & {
				[key: string]: Role<{}>;
			};
			getSession: (context: GenericEndpointContext) => Promise<{
				session: Session & {
					activeOrganizationId?: string;
				} & TeamSession<O>;
				user: User;
			}>;
		};
	});

export const orgSessionMiddleware = <O extends OrganizationOptions>() =>
	createAuthMiddleware(
		{
			use: [sessionMiddleware],
		},
		async (ctx) => {
			const session = ctx.context.session as {
				session: Session & {
					activeOrganizationId?: string;
				} & TeamSession<O>;
				user: User;
			};
			return {
				session,
			};
		},
	);
