import { type Context } from "better-call";
import type { Session, User } from "../../types";
import { createAuthMiddleware } from "../../api/call";
import { sessionMiddleware } from "../../api";
import type { Role, defaultRoles } from "./access";
import type { SwarmOptions } from "./swarm";

export const swmMiddleware = createAuthMiddleware(async (ctx) => {
	return {} as {
		swmOptions: SwarmOptions;
		roles: typeof defaultRoles & {
			[key: string]: Role<{}>;
		};
		getSession: (context: Context<any, any>) => Promise<{
			session: Session & {
				activeSwarmId?: string;
			};
			user: User;
		}>;
	};
});

export const swmSessionMiddleware = createAuthMiddleware(
	{
		use: [sessionMiddleware],
	},
	async (ctx) => {
		const session = ctx.context.session as {
			session: Session & {
				activeSwarmId?: string;
			};
			user: User;
		};
		return {
			session,
		};
	},
);
