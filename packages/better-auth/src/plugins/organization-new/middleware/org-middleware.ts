import type { GenericEndpointContext } from "@better-auth/core";
import { createAuthMiddleware } from "@better-auth/core/api";
import type { Session, User } from "@better-auth/core/db";
import type { Role } from "../../access";
import type { defaultRoles } from "../access/statement";
import type { ResolvedOrganizationOptions } from "../types";

export const orgMiddleware = createAuthMiddleware(async () => {
	return {} as {
		orgOptions: ResolvedOrganizationOptions;
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
