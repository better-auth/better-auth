import { APIError, Context, createEndpointCreator } from "better-call";
import { createAuthMiddleware, optionsMiddleware } from "../../api/call";
import { OrganizationOptions } from "./organization";
import { defaultRoles, Role } from "./access";
import { Session, User } from "../../adapters/schema";
import { getSession } from "../../api/routes";
import { sessionMiddleware } from "../../api/middlewares/session";

export const orgMiddleware = createAuthMiddleware(async (ctx) => {
	return {} as {
		orgOptions: OrganizationOptions;
		roles: typeof defaultRoles & {
			[key: string]: Role<{}>;
		};
		getSession: (context: Context<any, any>) => Promise<{
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
		//@ts-expect-error: fix this later on better-call repo. Session middleware will return session in the context.
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
