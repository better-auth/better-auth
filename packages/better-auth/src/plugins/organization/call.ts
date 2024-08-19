import { APIError, Context, createEndpointCreator } from "better-call";
import { createAuthMiddleware, optionsMiddleware } from "../../api/call";
import { OrganizationOptions } from "./organization";
import { defaultRoles, Role } from "./access";
import { Session, User } from "../../adapters/schema";
import { getSession } from "../../api/routes";

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

export const sessionMiddleware = createAuthMiddleware(async (ctx) => {
	const session = await getSession({
		...ctx,
		//@ts-expect-error: By default since this request context comes from a router it'll have a `router` flag which force it to be a request object
		_flag: undefined,
	});
	console.log({ session });
	if (!session?.session) {
		throw new APIError("UNAUTHORIZED");
	}
	return {
		session: {
			session: session.session as Session & {
				activeOrganizationId?: string;
			},
			user: session.user,
		},
	};
});
