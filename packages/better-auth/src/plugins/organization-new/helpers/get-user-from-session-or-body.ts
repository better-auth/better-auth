import type { GenericEndpointContext } from "@better-auth/core";
import { BASE_ERROR_CODES } from "@better-auth/core/error";
import { APIError, getSessionFromCtx } from "../../../api";

/**
 * Resolve the authenticated user from either:
 * - a client session (via cookies on the request), or
 * - an explicit `userId` provided in the request body (server-to-server).
 *
 * Behavior:
 * - If a valid session exists, returns the session's user.
 * - Otherwise, requires a valid `userId` in `ctx.body` and loads that user.
 * - Throws:
 *   - UNAUTHORIZED if neither a session nor `userId` is provided.
 *   - BAD_REQUEST (USER_NOT_FOUND) if `userId` is provided but no user exists.
 *
 *
 * @param ctx - The endpoint context containing the request, body, and adapters.
 * @returns The resolved user entity.
 */
export const getUserFromSessionOrBody = async (ctx: GenericEndpointContext) => {
	const session = await getSessionFromCtx(ctx);
	if (session?.user) return session.user;

	if (!ctx.body.userId) {
		throw APIError.fromStatus("UNAUTHORIZED");
	}

	const user = await ctx.context.internalAdapter.findUserById(ctx.body.userId);
	if (!user) {
		throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.USER_NOT_FOUND);
	}

	return user;
};
