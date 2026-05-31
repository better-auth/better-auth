import type { GenericEndpointContext } from "@better-auth/core";
import type { getSessionFromCtx } from "better-auth/api";
import { APIError } from "better-auth/api";
import type { OAuthOptions, Scope } from "../types";

/**
 * Authorizes a client action against the configured `clientPrivileges` hook.
 *
 * This is the single authorization helper for every OAuth client mutation. The
 * create path enforces it at the shared creation chokepoint so that no
 * registration route can reach client persistence without it.
 *
 * @throws APIError UNAUTHORIZED when there is no session or the hook denies the action.
 * @throws APIError BAD_REQUEST when the request carries no headers.
 */
export async function assertClientPrivileges(
	ctx: GenericEndpointContext,
	session: Awaited<ReturnType<typeof getSessionFromCtx>>,
	opts: OAuthOptions<Scope[]>,
	action: "create" | "read" | "update" | "delete" | "list" | "rotate",
) {
	if (!session) throw new APIError("UNAUTHORIZED");
	if (!ctx.headers) throw new APIError("BAD_REQUEST");
	if (
		opts.clientPrivileges &&
		!(await opts.clientPrivileges({
			headers: ctx.headers,
			action,
			session: session.session,
			user: session.user,
		}))
	) {
		throw new APIError("UNAUTHORIZED");
	}
}
