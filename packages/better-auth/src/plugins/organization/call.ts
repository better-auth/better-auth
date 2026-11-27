import type { GenericEndpointContext } from "@better-auth/core";
import { createAuthMiddleware } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import { getAuthoritativeSessionFromCtx, isStateful } from "../../api";
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

type OrgSession = {
	session: Session & {
		activeTeamId?: string | undefined;
		activeOrganizationId?: string | undefined;
	};
	user: User;
};

/**
 * Reads the session from the authoritative source. A session an earlier hook
 * built in memory (an API key session) is kept when the request carries no
 * session cookie, because there is nothing in the session store to re-read.
 * When the request carries a session cookie for a different user than that
 * hook session, no session is returned instead of silently picking one.
 */
export const getOrgSessionFromCtx = async (ctx: GenericEndpointContext) => {
	const hookSession = ctx.context.session as OrgSession | null;
	if (isStateful(ctx) && hookSession) {
		const sessionToken = await ctx.getSignedCookie(
			ctx.context.authCookies.sessionToken.name,
			ctx.context.secret,
		);
		if (!sessionToken) {
			return hookSession;
		}
	}
	const session = (await getAuthoritativeSessionFromCtx(
		ctx,
	)) as OrgSession | null;
	if (hookSession && session && hookSession.user.id !== session.user.id) {
		ctx.context.session = null;
		return null;
	}
	return session;
};

/**
 * The middleware forces the endpoint to require a valid authoritative session.
 * It bypasses the cookie cache when a server-side session store exists, and
 * appends additional types to the session type regarding organizations.
 */
export const orgSessionMiddleware = createAuthMiddleware(async (ctx) => {
	const session = await getOrgSessionFromCtx(ctx);
	if (!session?.session) {
		throw APIError.from("UNAUTHORIZED", {
			message: "Unauthorized",
			code: "UNAUTHORIZED",
		});
	}
	return {
		session,
	};
});
